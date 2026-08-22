import { Worker, type Job } from "bullmq";
import { connection } from "@/agent/queue";
import { fetchAndExtractListings } from "@/agent/crawler";
import { prisma } from "@/lib/prisma";
import { ListingSource, ListingStatus } from "@/generated/prisma/enums";

async function crawlCompany(job: Job) {
  const { companyId } = job.data as { companyId: string };

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error(`Company ${companyId} not found`);
  if (!company.careersPageUrl) {
    console.warn(`[crawl] ${company.name}: no careersPageUrl, skipping`);
    return { skipped: true };
  }

  console.log(`[crawl] ${company.name} — crawling ${company.careersPageUrl}`);
  const fresh = await fetchAndExtractListings(company.name, company.careersPageUrl);

  const previous = await prisma.listing.findMany({
    where: { companyId, status: ListingStatus.OPEN },
    select: { externalId: true },
  });
  const previousCandidates = previous.map((l) => ({ externalId: l.externalId } as { externalId: string }));

  const freshExternalIds = new Set(fresh.map((l) => l.externalId));
  await prisma.$transaction([
    ...fresh.map((l) =>
      prisma.listing.upsert({
        where: { companyId_externalId: { companyId, externalId: l.externalId } },
        create: {
          companyId,
          externalId: l.externalId,
          title: l.title,
          location: l.location,
          applyUrl: l.applyUrl,
          description: l.description,
          postedAt: l.postedAt ? new Date(l.postedAt) : null,
          source: ListingSource.SOURCED,
          status: ListingStatus.OPEN,
        },
        update: {
          title: l.title,
          location: l.location,
          applyUrl: l.applyUrl,
          description: l.description,
          postedAt: l.postedAt ? new Date(l.postedAt) : null,
          status: ListingStatus.OPEN,
          lastSeenAt: new Date(),
        },
      })
    ),
    prisma.company.update({
      where: { id: companyId },
      data: { lastCrawlAt: new Date() },
    }),
  ]);

  // Mark previously-open listings that disappeared from the page as CLOSED.
  const closedExternalIds = previousCandidates
    .filter((p) => !freshExternalIds.has(p.externalId))
    .map((p) => p.externalId);

  if (closedExternalIds.length > 0) {
    await prisma.listing.updateMany({
      where: { companyId, externalId: { in: closedExternalIds }, status: ListingStatus.OPEN },
      data: { status: ListingStatus.CLOSED },
    });
  }

  // Fresh listings created this run — signal the matching engine.
  // Informational only: this timestamp heuristic is not load-bearing. The
  // matching engine dedupes correctly via the Match unique constraint on
  // [userId, listingId], so this count is purely for the crawl log.
  const justCreatedCount = freshExternalIds.size;

  console.log(
    `[crawl] ${company.name} — ${fresh.length} listings, ${closedExternalIds.length} closed, ${justCreatedCount} fresh`
  );

  return { company: company.name, found: fresh.length, closed: closedExternalIds.length, justCreated: justCreatedCount };
}

export function startCrawlWorker() {
  const worker = new Worker(
    "crawl",
    async (job) => {
      switch (job.name) {
        case "crawl-company":
          return crawlCompany(job);
        default:
          throw new Error(`Unknown crawl job: ${job.name}`);
      }
    },
    { connection, concurrency: Number(process.env.AGENT_CONCURRENCY ?? 2) }
  );

  worker.on("completed", (job) => console.log(`[crawl] job ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`[crawl] job ${job?.id} failed:`, err.message));
  console.log("Crawl worker started");

  return worker;
}