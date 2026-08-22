"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus, ListingSource, CompanyVerificationStatus, VerificationTier } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { notifyUser } from "@/lib/notifications";
import { hasVerifiedDomain, companyDomains } from "@/lib/verification";
import { draftReferralAsk } from "@/lib/referral";
import { createExtensionToken, revokeExtensionToken } from "@/lib/extension-token";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function connectExtension() {
  const userId = await requireUserId();
  const { token, expiresAt } = await createExtensionToken(userId);
  return { ok: true, token, expiresAt };
}

export async function disconnectExtension(token?: string) {
  const userId = await requireUserId();
  await revokeExtensionToken(userId, token);
  revalidatePath("/profile");
  return { ok: true };
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

  // Server-side tier resolution: domain-verified posts carry the trusted tier,
  // otherwise UNVERIFIED. The client can't self-declare trust.
  const tier = input.companyId
    ? await resolvePostTier(userId, input.companyId)
    : VerificationTier.UNVERIFIED;

  await prisma.communityPost.create({
    data: {
      authorId: userId,
      pseudonym: pseudonymize(user?.name),
      companyId: input.companyId ?? null,
      role: input.role ?? null,
      body: input.body.slice(0, 4000),
      tier,
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
}) {
  const userId = await requireUserId();

  let companyId = input.companyId;
  if (!companyId) {
    if (!input.companyName) throw new Error("Company required");
    const slug = input.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const company = await prisma.company.upsert({
      where: { slug },
      create: { name: input.companyName, slug },
      update: {},
    });
    companyId = company.id;
  }

  const listing = await prisma.listing.create({
    data: {
      companyId,
      externalId: `manual-${userId.slice(-8)}-${Date.now()}`,
      title: input.title.slice(0, 200),
      description: input.description ?? null,
      applyUrl: input.applyUrl ?? null,
      // Server-side tier resolution — never trust a client-supplied enum here.
      source: await resolveListingSource(userId, companyId),
    },
  });

  revalidatePath("/post");
  revalidatePath("/");
  return { ok: true, listingId: listing.id };
}

/**
 * Server-side provenance resolution. The client never states the tier; it is
 * derived from real, verifiable signals:
 *   - domain-verified email  -> EMPLOYEE_POSTED (highest trust)
 *   - agent presence check   -> EMPLOYER_SUBMITTED_VERIFIED
 *   - otherwise              -> EMPLOYER_SUBMITTED_UNVERIFIED
 */
async function resolveListingSource(userId: string, companyId: string): Promise<ListingSource> {
  const verified = await hasVerifiedDomain(userId, companyId);
  if (verified) return ListingSource.EMPLOYEE_POSTED;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (company && (await agentConfirmsPresence(company))) {
    return ListingSource.EMPLOYER_SUBMITTED_VERIFIED;
  }

  return ListingSource.EMPLOYER_SUBMITTED_UNVERIFIED;
}

/**
 * Minimal agent presence check: resolve a company domain (from its stored
 * domain or careers URL host) and confirm it has a live DNS record / reachable
 * origin. This is deliberately lightweight; it establishes the company is real
 * without claiming anything about the poster's authority.
 */
async function agentConfirmsPresence(company: { id: string; domain?: string | null; careersPageUrl?: string | null; name: string }): Promise<boolean> {
  const domains = companyDomains(company);
  for (const d of domains) {
    const ok = await checkDomain(d);
    if (ok) {
      await prisma.company.update({
        where: { id: company.id },
        data: { verificationStatus: CompanyVerificationStatus.PRESENCE_CONFIRMED },
      }).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Resolve the community-post tier server-side from a real verification signal. */
async function resolvePostTier(userId: string, companyId: string): Promise<VerificationTier> {
  const verified = await hasVerifiedDomain(userId, companyId);
  return verified ? VerificationTier.DOMAIN_VERIFIED : VerificationTier.UNVERIFIED;
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

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

/** A verified employee opts in as a referrer for a company. Requires a verified work domain. */
export async function optInAsReferrer(input: {
  companyId: string;
  teams?: string[];
  roles?: string[];
  note?: string | null;
}) {
  const userId = await requireUserId();

  const verified = await hasVerifiedDomain(userId, input.companyId);
  if (!verified) throw new Error("Verify a work email for this company before becoming a referrer.");

  await prisma.referrerProfile.upsert({
    where: { userId_companyId: { userId, companyId: input.companyId } },
    create: {
      userId,
      companyId: input.companyId,
      teams: input.teams ?? [],
      roles: input.roles ?? [],
      note: input.note ?? null,
      active: true,
    },
    update: {
      teams: input.teams ?? [],
      roles: input.roles ?? [],
      note: input.note ?? null,
      active: true,
    },
  });
  revalidatePath("/referrals");
  return { ok: true };
}

/** Opt out as a referrer for a company. */
export async function retireAsReferrer(companyId: string) {
  const userId = await requireUserId();
  await prisma.referrerProfile.updateMany({
    where: { userId, companyId },
    data: { active: false },
  });
  revalidatePath("/referrals");
  return { ok: true };
}

/**
 * Find referral opportunities for a candidate: listings at companies that have
 * at least one active referrer, for which the candidate has an open match.
 */
export async function getReferralOpportunities() {
  const userId = await requireUserId();

  const matches = await prisma.match.findMany({
    where: { userId, status: MatchStatus.PENDING },
    include: {
      listing: { include: { company: { select: { name: true, id: true } } } },
    },
  });

  const companyIds = [...new Set(matches.map((m) => m.listing.companyId))];
  const referrers = await prisma.referrerProfile.findMany({
    where: { companyId: { in: companyIds }, active: true },
    include: { user: { select: { id: true, name: true } } },
  });
  const byCompany = new Map<string, typeof referrers>();
  for (const r of referrers) {
    const arr = byCompany.get(r.companyId) ?? [];
    arr.push(r);
    byCompany.set(r.companyId, arr);
  }

  const opportunities = matches
    .filter((m) => (byCompany.get(m.listing.companyId)?.length ?? 0) > 0)
    .map((m) => {
      const referrer = byCompany.get(m.listing.companyId)![0];
      return {
        matchId: m.id,
        listing: { id: m.listing.id, title: m.listing.title, company: m.listing.company.name },
        referrer: { id: referrer.userId, name: referrer.user.name ?? "a current employee" },
        referral: { id: null as string | null, status: "NONE", askDraft: null as string | null },
      };
    });

  return opportunities;
}

/** Create a DRAFTED referral with an agent-drafted ask for the candidate to review. */
export async function offerReferral(
  matchId: string,
  referrerUserId: string
) {
  const candidateId = await requireUserId();

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { listing: { include: { company: { select: { name: true } } } } },
  });
  if (!match || match.userId !== candidateId) throw new Error("Match not found");

  const user = await prisma.user.findUnique({ where: { id: candidateId }, select: { name: true, resumeParsed: true } });
  const profile = (user?.resumeParsed ?? {}) as Record<string, unknown>;

  const askDraft = await draftReferralAsk({
    referrerName: referrerUserId,
    referralCompany: match.listing.company.name,
    listingTitle: match.listing.title,
    candidateSkills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
    candidateHeadline: (profile.headline as string) || user?.name || undefined,
  });

  const referral = await prisma.referral.create({
    data: {
      listingId: match.listingId,
      referrerId: referrerUserId,
      candidateId,
      status: "DRAFTED",
      askDraft,
      timeline: [{ status: "DRAFTED", at: new Date().toISOString() }],
    },
  });
  revalidatePath("/referrals");
  return { ok: true, referralId: referral.id, askDraft };
}

/** Candidate approves the drafted ask -> SENT, and notifies the referrer. */
export async function sendReferral(referralId: string) {
  const candidateId = await requireUserId();

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { listing: { include: { company: { select: { name: true } } } } },
  });
  if (!referral || referral.candidateId !== candidateId) throw new Error("Referral not found");

  const currentTimeline = Array.isArray(referral.timeline) ? referral.timeline : [];
  const newTimeline = [...currentTimeline, { status: "SENT", at: new Date().toISOString() }];

  await prisma.$transaction([
    prisma.referral.update({
      where: { id: referralId },
      data: { status: "SENT", timeline: newTimeline as object },
    }),
  ]);

  await notifyUser(referral.referrerId, {
    title: `Referral request: ${referral.listing.title}`,
    body: `${referral.listing.company.name} — a candidate sent you a referral ask. Review and respond.`,
  });

  revalidatePath("/referrals");
  return { ok: true };
}

/** DNS presence check: does this domain resolve (and answer an HTTPS request)? */
async function checkDomain(domain: string): Promise<boolean> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Jobtwin/0.1)" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status < 500;
  } catch {
    // Fall back to DNS-only resolution via a lookups.
    try {
      const { lookup } = await import("node:dns/promises");
      await lookup(domain);
      return true;
    } catch {
      return false;
    }
  }
}