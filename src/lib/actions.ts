"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { notifyUser } from "@/lib/notifications";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function saveCriteria(input: {
  name?: string;
  keywords: string[];
  locations: string[];
  remoteOnly: boolean;
  minSalary?: number | null;
}) {
  const userId = await requireUserId();

  const existing = await prisma.searchCriteria.findFirst({ where: { userId } });
  if (existing) {
    await prisma.searchCriteria.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        keywords: input.keywords,
        locations: input.locations,
        remoteOnly: input.remoteOnly,
        minSalary: input.minSalary ?? null,
      },
    });
  } else {
    await prisma.searchCriteria.create({
      data: {
        userId,
        name: input.name ?? "My criteria",
        keywords: input.keywords,
        locations: input.locations,
        remoteOnly: input.remoteOnly,
        minSalary: input.minSalary ?? null,
      },
    });
  }

  revalidatePath("/criteria");
  revalidatePath("/");
  return { ok: true };
}

export async function decideMatch(matchId: string, decision: "approve" | "reject") {
  const userId = await requireUserId();

  const match = await prisma.match.findFirst({
    where: { id: matchId, userId, status: MatchStatus.PENDING },
  });
  if (!match) throw new Error("Match not found or already decided");

  const nextStatus = decision === "approve" ? MatchStatus.APPROVED : MatchStatus.REJECTED;

  // Approving chains straight into the apply flow: an Application is created
  // in APPLIED state. Rejecting just closes the match card.
  await prisma.$transaction([
    prisma.match.update({
      where: { id: match.id },
      data: { status: nextStatus, decidedAt: new Date() },
    }),
    ...(decision === "approve"
      ? [
          prisma.application.create({
            data: {
              userId,
              listingId: match.listingId,
              status: "APPLIED",
            },
          }),
        ]
      : []),
  ])

  if (decision === "approve") {
    const listing = await prisma.listing.findUnique({
      where: { id: match.listingId },
      include: { company: { select: { name: true } } },
    });
    if (listing) {
      await notifyUser(userId, {
        title: `Applied to ${listing.title}`,
        body: `Your application is out to ${listing.company.name}. Track it from your profile.`,
        url: listing.applyUrl ?? undefined,
      });
    }
  }

  revalidatePath("/queue");
  revalidatePath("/");
  return { ok: true };
}

export async function createPost(input: {
  body: string;
  companyId?: string | null;
  role?: string | null;
}) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

  await prisma.communityPost.create({
    data: {
      authorId: userId,
      pseudonym: pseudonymize(user?.name),
      companyId: input.companyId ?? null,
      role: input.role ?? null,
      body: input.body.slice(0, 4000),
    },
  });
  revalidatePath("/community");
  return { ok: true };
}

/** Stable pseudonym derived from a user's name — pseudonymous, not secret. */
function pseudonymize(name: string | null | undefined): string {
  const base = (name ?? "seeker").toLowerCase().replace(/[^a-z]/g, "");
  return `anon_${base.slice(0, 5)}${hash(base) % 1000}`;
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h;
}

export async function postJobListing(input: {
  title: string;
  location?: string | null;
  applyUrl?: string | null;
  description?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  source: "EMPLOYEE_POSTED" | "EMPLOYER_SUBMITTED_VERIFIED" | "EMPLOYER_SUBMITTED_UNVERIFIED";
}) {
  const userId = await requireUserId();

  let companyId = input.companyId;
  if (!companyId && input.companyName) {
    const slug = input.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const company = await prisma.company.upsert({
      where: { slug },
      create: {
        name: input.companyName,
        slug,
        verificationStatus:
          input.source === "EMPLOYEE_POSTED"
            ? "DOMAIN_VERIFIED"
            : input.source === "EMPLOYER_SUBMITTED_VERIFIED"
              ? "PRESENCE_CONFIRMED"
              : "UNVERIFIED",
      },
      update: {},
    });
    companyId = company.id;
  }
  if (!companyId) throw new Error("Company required");

  // Stable externalId so manual postings diff cleanly against crawls.
  const externalId = `manual-${userId.slice(-8)}-${Date.now()}`;

  const listing = await prisma.listing.create({
    data: {
      companyId,
      externalId,
      title: input.title.slice(0, 200),
      description: input.description ?? null,
      applyUrl: input.applyUrl ?? null,
      source: input.source,
    },
  });

  revalidatePath("/post");
  revalidatePath("/");
  return { ok: true, listingId: listing.id };
}

export async function updateApplicationStatus(
  applicationId: string,
  status: "SCREENED" | "INTERVIEW" | "OUTCOME"
) {
  const userId = await requireUserId();
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!app) throw new Error("Application not found");

  await prisma.application.update({
    where: { id: applicationId },
    data: { status },
  });
  await recomputeTransparency(app.listingId);
  revalidatePath("/applications");
  return { ok: true };
}

async function recomputeTransparency(listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return;

  const apps = await prisma.application.findMany({ where: { listingId } });
  if (apps.length === 0) return;

  const responded = apps.filter((a) => a.status !== "APPLIED").length;
  const withTimeline = apps.filter((a) => a.timeline && a.status !== "APPLIED").length;
  const avgDays = withTimeline
    ? apps
        .filter((a) => a.timeline && a.status !== "APPLIED")
        .reduce((sum, a) => {
          const t = (a.timeline as { status: string; at: string }[] | null) ?? [];
          const applied = t.find((x) => x.status === "APPLIED")?.at;
          const respondedTs = t.find((x) => x.status !== "APPLIED")?.at;
          return sum + (applied && respondedTs ? (new Date(respondedTs).getTime() - new Date(applied).getTime()) / 86400000 : 0);
        }, 0) / withTimeline
    : null;

  await prisma.transparencyStats.upsert({
    where: { companyId_role: { companyId: listing.companyId, role: listing.title } },
    create: {
      companyId: listing.companyId,
      role: listing.title,
      responseRate: apps.length ? (responded / apps.length) * 100 : null,
      avgTimeToResponse: avgDays,
      ghostingRate: apps.length ? ((apps.length - responded) / apps.length) * 100 : null,
      sampleSize: apps.length,
    },
    update: {
      responseRate: apps.length ? (responded / apps.length) * 100 : null,
      avgTimeToResponse: avgDays,
      ghostingRate: apps.length ? ((apps.length - responded) / apps.length) * 100 : null,
      sampleSize: apps.length,
    },
  });
}