import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { llmText } from "@/lib/llm";
import { notifyUser } from "@/lib/notifications";

/**
 * Score a listing against a user's saved criteria.
 * Deterministic shape-based scoring on title/location/role keywords; the LLM
 * adds a human-readable reason string used on the swipe card.
 */
export function scoreListing(
  listing: { title: string; location?: string | null; description?: string | null },
  criteria: { keywords: string[]; locations: string[]; remoteOnly: boolean }
): { score: number; reasons: string[]; matchedKeyword: boolean; locationMatched: boolean } {
  let score = 0;
  const reasons: string[] = [];
  let matchedKeyword = false;
  let locationMatched = false;
  const haystack = `${listing.title} ${listing.description ?? ""}`.toLowerCase();

  for (const kw of criteria.keywords) {
    if (haystack.includes(kw.toLowerCase())) {
      score += 10;
      reasons.push(`matches keyword "${kw}"`);
      matchedKeyword = true;
    }
  }

  const loc = (listing.location ?? "").toLowerCase();
  if (criteria.remoteOnly) {
    if (loc.includes("remote")) {
      score += 25;
      reasons.push("remote role");
      locationMatched = true;
    } else if (Array.isArray(criteria.locations) && criteria.locations.some((l) => loc.includes(l.toLowerCase()))) {
      score += 15;
      reasons.push("matches location while remote-only preferred");
      locationMatched = true;
    }
  } else if (criteria.locations?.length) {
    if (loc.includes("remote")) {
      score += 15;
      reasons.push("remote");
      locationMatched = true;
    }
    for (const l of criteria.locations) {
      if (loc.includes(l.toLowerCase())) {
        score += 25;
        reasons.push(`location matches "${l}"`);
        locationMatched = true;
      }
    }
  }

  return { score, reasons, matchedKeyword, locationMatched };
}

async function draftReason(
  listing: { title: string; companyName: string; location?: string | null },
  criteriaName: string
): Promise<string> {
  try {
    return await llmText({
      system: "You draft a one-sentence, specific rationale for why a job listing matches a candidate's saved criteria. Be concrete and terse.",
      user: `Criteria: ${criteriaName}\nCompany: ${listing.companyName}\nRole: ${listing.title}\nLocation: ${listing.location ?? "n/a"}`,
      maxTokens: 80,
    });
  } catch {
    return `Matches saved criteria "${criteriaName}".`;
  }
}

/**
 * Matching engine: take recently-seen open listings and match them against
 * every active user's saved criteria. Creates PENDING match rows (the bounded
 * review queue source). Idempotent per (userId, listingId).
 */
export async function runMatchingEngine() {
  const criteriaList = await prisma.searchCriteria.findMany({
    where: { active: true },
    include: { user: { select: { id: true, channels: { where: { enabled: true } } } } },
  });

  if (criteriaList.length === 0) {
    console.log("[match] no active criteria — nothing to match");
    return 0;
  }

  // Candidate listings: open, sourced, seen recently, that the user hasn't already seen.
  const listings = await prisma.listing.findMany({
    where: { status: "OPEN" },
    include: { company: true },
    orderBy: { firstSeenAt: "desc" },
    take: 200,
  });

  let created = 0;
  for (const criteria of criteriaList) {
    const existing = await prisma.match.findMany({
      where: { userId: criteria.userId },
      select: { listingId: true },
    });
    const existingIds = new Set(existing.map((m) => m.listingId));

    for (const listing of listings) {
      if (existingIds.has(listing.id)) continue;

      const { score, reasons, matchedKeyword, locationMatched } = scoreListing(listing, criteria);
      // Keep the queue curated: a single loose keyword hit isn't enough. Require
      // at least one keyword and (a location/remote match OR >= 2 keyword hits).
      const keywordHitCount = reasons.filter((r) => r.startsWith("matches keyword")).length;
      const pass = matchedKeyword && (locationMatched || keywordHitCount >= 2);
      if (!pass) continue;

      const rationale = await draftReason(
        {
          title: listing.title,
          companyName: listing.company.name,
          location: listing.location,
        },
        criteria.name
      );

      await prisma.match.create({
        data: {
          userId: criteria.userId,
          listingId: listing.id,
          criteriaId: criteria.id,
          score,
          reasons: { reasons, rationale },
          status: MatchStatus.PENDING,
        },
      });

      // The moment a match exists, ping the user — speed is the whole reason
      // notifications are real-time and not batched. A failed send must not
      // fail the match, so notify is best-effort and notifiedAt records success.
      try {
        await notifyUser(criteria.userId, {
          title: `New match: ${listing.title}`,
          body: `${listing.company.name} — swipe right to apply before early-applicant windows close.`,
          url: appQueueUrl(),
        });
        await prisma.match.update({
          where: { userId_listingId: { userId: criteria.userId, listingId: listing.id } },
          data: { notifiedAt: new Date() },
        });
      } catch (err) {
        console.warn(`[match] notify failed for ${listing.title}:`, (err as Error).message);
      }

      created += 1;
      existingIds.add(listing.id);
    }
  }

  console.log(`[match] created ${created} new match(es)`);
  return created;
}

/** Link into the swipe review queue (root route) for notification messages. */
function appQueueUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/`;
}

export { MatchStatus };