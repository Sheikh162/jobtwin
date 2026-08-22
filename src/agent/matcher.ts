import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { llmText } from "@/lib/llm";

/**
 * Score a listing against a user's saved criteria.
 * Deterministic shape-based scoring on title/location/role keywords; the LLM
 * adds a human-readable reason string used on the swipe card.
 */
export function scoreListing(
  listing: { title: string; location?: string | null; description?: string | null },
  criteria: { keywords: string[]; locations: string[]; remoteOnly: boolean }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const haystack = `${listing.title} ${listing.description ?? ""}`.toLowerCase();

  for (const kw of criteria.keywords) {
    if (haystack.includes(kw.toLowerCase())) {
      score += 10;
      reasons.push(`matches keyword "${kw}"`);
    }
  }

  const loc = (listing.location ?? "").toLowerCase();
  if (criteria.remoteOnly) {
    if (loc.includes("remote")) {
      score += 25;
      reasons.push("remote role");
    } else if (Array.isArray(criteria.locations) && criteria.locations.some((l) => loc.includes(l.toLowerCase()))) {
      score += 15;
      reasons.push("matches location while remote-only preferred");
    }
  } else if (criteria.locations?.length) {
    if (loc.includes("remote")) {
      score += 15;
      reasons.push("remote");
    }
    for (const l of criteria.locations) {
      if (loc.includes(l.toLowerCase())) {
        score += 25;
        reasons.push(`location matches "${l}"`);
      }
    }
  }

  return { score, reasons };
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
    include: { user: { include: { channels: true } } },
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

      const { score, reasons } = scoreListing(listing, criteria);
      if (score < 10) continue;

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
      created += 1;
      existingIds.add(listing.id);
    }
  }

  console.log(`[match] created ${created} new match(es)`);
  return created;
}

export { MatchStatus };