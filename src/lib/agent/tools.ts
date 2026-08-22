import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { getQueueStats } from "@/lib/queue";

// ---------------------------------------------------------------------------
// Tool invocation contract. Each tool is described to the LLM (for tool
// selection) and has a handler that executes real, per-user work.
// ---------------------------------------------------------------------------

export interface AgentToolResult {
  tool: string;
  summary: string; // one-line what it did, shown as a badge in the UI
  data: unknown; // structured data fed back to the LLM
}

const ToolSelectionSchema = z.object({
  tool: z.string().nullish().default(null),
  args: z.record(z.string(), z.unknown()).nullish().default({}),
});

export type ToolArg = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tool handlers (all scoped to userId — the "one engine, N twins" rule)
// ---------------------------------------------------------------------------

async function queueSummary(userId: string): Promise<AgentToolResult> {
  const [stats, matches] = await Promise.all([
    getQueueStats(userId),
    prisma.match.findMany({
      where: { userId, status: MatchStatus.PENDING },
      orderBy: { score: "desc" },
      take: 8,
      include: { listing: { include: { company: { select: { name: true } } } } },
    }),
  ]);

  return {
    tool: "get_queue_summary",
    summary: `Queue: ${stats.pending} pending, ${stats.approved} approved, ${stats.rejected} rejected, ${stats.applied} applied`,
    data: {
      stats,
      topMatches: matches.map((m) => ({
        title: m.listing.title,
        company: m.listing.company.name,
        score: m.score,
      })),
    },
  };
}

async function matchDetails(userId: string, args: ToolArg): Promise<AgentToolResult> {
  // The LLM sometimes inserts spaces when transcribing ids — strip them.
  const matchId = String(args.matchId ?? "").replace(/[\s-]/g, "");
  let match = await prisma.match.findFirst({
    where: { id: matchId, userId },
    include: {
      listing: { include: { company: { select: { name: true, logoUrl: true } } } },
      criteria: { select: { name: true } },
    },
  });

  // Fall back to a prefix match for truncated ids.
  if (!match && matchId.length >= 6) {
    match = await prisma.match.findFirst({
      where: { id: { startsWith: matchId }, userId },
      include: {
        listing: { include: { company: { select: { name: true, logoUrl: true } } } },
        criteria: { select: { name: true } },
      },
    });
  }

  if (!match) {
    return {
      tool: "get_match_details",
      summary: "Match not found for this user",
      data: { error: "Match not found" },
    };
  }

  const reasons = (match.reasons ?? {}) as Record<string, unknown>;

  return {
    tool: "get_match_details",
    summary: `Details for: ${match.listing.title}`,
    data: {
      id: match.id,
      title: match.listing.title,
      company: match.listing.company.name,
      location: match.listing.location,
      applyUrl: match.listing.applyUrl,
      source: match.listing.source,
      score: match.score,
      status: match.status,
      reasons,
      criteria: match.criteria?.name ?? null,
      description: match.listing.description?.slice(0, 400) ?? null,
    },
  };
}

async function getCriteria(userId: string): Promise<AgentToolResult> {
  const criteria = await prisma.searchCriteria.findFirst({ where: { userId } });

  return {
    tool: "get_criteria",
    summary: criteria ? `Criteria: ${criteria.name}` : "No criteria saved yet",
    data: criteria
      ? {
          name: criteria.name,
          keywords: criteria.keywords,
          locations: criteria.locations,
          remoteOnly: criteria.remoteOnly,
          minSalary: criteria.minSalary,
        }
      : null,
  };
}

async function applicationSummary(userId: string): Promise<AgentToolResult> {
  const apps = await prisma.application.findMany({
    where: { userId },
    include: {
      listing: { include: { company: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const byStatus = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    tool: "get_application_summary",
    summary: `Applications: ${apps.length}`,
    data: {
      byStatus,
      recent: apps.map((a) => ({
        title: a.listing.title,
        company: a.listing.company.name,
        status: a.status,
      })),
    },
  };
}

async function checkCompany(userId: string, args: ToolArg): Promise<AgentToolResult> {
  const companyName = String(args.name ?? "").trim();
  if (!companyName) {
    return {
      tool: "check_company",
      summary: "No company name given",
      data: { error: "Provide a company name, e.g. Vercel" },
    };
  }

  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const existing = await prisma.company.findFirst({
    where: { OR: [{ slug }, { name: { equals: companyName, mode: "insensitive" } }] },
    select: { id: true, name: true, careersPageUrl: true, seedActive: true, lastCrawlAt: true },
  });

  let company = existing;
  if (!company) {
    // Derive a careers page guess; the crawler will detect the actual ATS.
    const domain = slug.replace(/-/g, "");
    company = await prisma.company.upsert({
      where: { slug },
      create: {
        name: companyName,
        slug,
        careersPageUrl: `https://${domain}.com/careers`,
        seedActive: true,
      },
      update: {},
      select: { id: true, name: true, careersPageUrl: true, seedActive: true, lastCrawlAt: true },
    });
    console.log(`[agent] check_company: created ${company.name} (${slug}) for user ${userId}`);
  } else if (!company.seedActive) {
    await prisma.company.update({ where: { id: company.id }, data: { seedActive: true } });
  }

  // Enqueue a crawl job for this company (reuses the daemon's queue).
  const { queues } = await import("@/agent/queue");
  await queues.crawl.add(
    "crawl-company",
    { companyId: company.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
    }
  );

  return {
    tool: "check_company",
    summary: `Queued a crawl for ${company.name}`,
    data: {
      company: company.name,
      careersPageUrl: company.careersPageUrl,
      lastCrawlAt: company.lastCrawlAt,
      note: "Crawl enqueued — refresh the review queue in a minute for new matches.",
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export const AGENT_TOOLS = {
  get_queue_summary: { handler: queueSummary, args: z.object({}).describe("No args") },
  get_match_details: {
    handler: matchDetails,
    args: z.object({ matchId: z.string().describe("The match id shown in the review queue") }),
  },
  get_criteria: { handler: getCriteria, args: z.object({}).describe("No args") },
  get_application_summary: { handler: applicationSummary, args: z.object({}).describe("No args") },
  check_company: {
    handler: checkCompany,
    args: z.object({ name: z.string().describe("Company name, e.g. Vercel") }),
  },
} as const;

export const TOOL_DESCRIPTIONS: Array<{ name: string; description: string }> = [
  { name: "get_queue_summary", description: "Summarize the user's review queue: pending matches, stats, top roles." },
  { name: "get_match_details", description: "Get details (reasons, location, apply URL, score) for one match by id." },
  { name: "get_criteria", description: "Get the user's saved search criteria." },
  { name: "get_application_summary", description: "Summarize the user's application statuses." },
  { name: "check_company", description: "Kick off a live crawl of a company's careers page to see what jobs it has now." },
];

export { ToolSelectionSchema };