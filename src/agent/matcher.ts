import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { llmText } from "@/lib/llm";
import { notifyUser } from "@/lib/notifications";

/**
 * Country/city aliasing for location matching. A search for "India" should
 * surface roles in Bengaluru/Hyderabad/Mumbai/etc., not only listings whose
 * location string literally contains "India". Small curated set — extendable.
 */
const COUNTRY_CITY_ALIASES: Record<string, string[]> = {
  india: ["india", "bengaluru", "bangalore", "hyderabad", "mumbai", "delhi", "noida", "gurgaon", "gurugram", "chennai", "pune", "kolkata", "ahmedabad"],
  "united states": ["united states", "usa", "us", "new york", "san francisco", "sf", "seattle", "austin", "remote - united states"],
  "united kingdom": ["united kingdom", "uk", "london", "england"],
  canada: ["canada", "toronto", "vancouver", "montreal"],
  germany: ["germany", "berlin", "munich", "hamburg"],
  france: ["france", "paris"],
  netherlands: ["netherlands", "amsterdam", "holland"],
  singapore: ["singapore"],
  australia: ["australia", "sydney", "melbourne"],
};

/** Does the listing location match a criteria location? Country-aware. */
export function locationMatches(
  listingLocation: string | null | undefined,
  criteriaLocation: string
): boolean {
  const loc = (listingLocation ?? "").toLowerCase();
  const want = criteriaLocation.toLowerCase().trim();
  if (!loc || !want) return false;

  // Direct substring: "Mumbai, India" vs "India", "Bengaluru" vs "bengaluru".
  if (loc.includes(want)) return true;
  if (loc.includes("remote") && want.includes("remote")) return true;

  // Country alias: criteria "India" + listing contains any Indian city.
  for (const [country, cities] of Object.entries(COUNTRY_CITY_ALIASES)) {
    if (want.includes(country) || country.includes(want)) {
      return cities.some((c) => loc.includes(c));
    }
    if (cities.includes(want)) {
      // Criteria is a city in this country — check the country name too.
      return loc.includes(country) || loc.includes(want);
    }
  }
  return false;
}

/**
 * Score a listing against a user's saved criteria.
 * Deterministic shape-based scoring on title/location/role keywords; the LLM
 * adds a human-readable reason string used on the swipe card.
 */
export function scoreListing(
  listing: { title: string; location?: string | null; description?: string | null },
  criteria: { keywords: string[]; locations: string[]; remoteOnly: boolean }
): { score: number; reasons: string[]; matchedKeyword: boolean; locationMatched: boolean; isRemote: boolean } {  let score = 0;
  const reasons: string[] = [];
  let matchedKeyword = false;
  let locationMatched = false;
  const haystack = `${listing.title} ${listing.description ?? ""}`.toLowerCase();
  const loc = (listing.location ?? "").toLowerCase();
  const isRemote = loc.includes("remote");

  for (const kw of criteria.keywords) {
    if (haystack.includes(kw.toLowerCase())) {
      score += 10;
      reasons.push(`matches keyword "${kw}"`);
      matchedKeyword = true;
    }
  }

  if (criteria.remoteOnly) {
    if (isRemote) {
      score += 25;
      reasons.push("remote role");
      locationMatched = true;
    } else if (Array.isArray(criteria.locations) && criteria.locations.some((l) => locationMatches(loc, l))) {
      score += 15;
      reasons.push("matches location while remote-only preferred");
      locationMatched = true;
    }
  } else if (criteria.locations?.length) {
    if (isRemote) {
      score += 15;
      reasons.push("remote");
      locationMatched = true;
    }
    for (const l of criteria.locations) {
      if (locationMatches(loc, l)) {
        score += 25;
        reasons.push(`location matches "${l}"`);
        locationMatched = true;
      }
    }
  }

  return { score, reasons, matchedKeyword, locationMatched, isRemote };
}

/**
 * Does the listing match any exclude term? Hard reject — "stop matching me to
 * anything under senior level" becomes excludeKeywords=["junior","associate",
 * "intern","graduate"]; any hit kills the match before scoring.
 */
export function matchesExcluded(
  listing: { title: string; location?: string | null; description?: string | null },
  excludeKeywords: string[]
): boolean {
  if (!excludeKeywords?.length) return false;
  const haystack = `${listing.title} ${listing.description ?? ""}`.toLowerCase();
  return excludeKeywords.some((kw) => {
    const term = kw.trim().toLowerCase();
    return term.length > 0 && haystack.includes(term);
  });
}

/**
 * Curation gate — the product's promise is a pre-vetted, bounded queue, so a
 * weak match must not sneak in. Pure + testable.
 *
 * Passes only when the listing carries real signal:
 *  - at least TWO keyword hits, OR
 *  - one keyword hit AND a location/remote match
 * AND clears the score floor (default 20; a single 10pt keyword hit alone is
 * never enough).
 *
 * Location intent: when the user saved specific locations (and is not
 * remoteOnly), a NON-remote listing must match one of those locations to enter
 * the queue — saving "India" means India, not "Remote - United States". Remote
 * listings stay eligible (they're location-flexible).
 *
 * Returns the reasons string array (needed downstream) or null if rejected.
 */
export function curatedMatchCheck(
  listing: { title: string; location?: string | null; description?: string | null },
  criteria: { keywords: string[]; locations: string[]; remoteOnly: boolean; excludeKeywords?: string[] },
  options?: { scoreFloor?: number }
): { score: number; reasons: string[] } | null {
  // Hard reject on excluded terms before any scoring.
  if (matchesExcluded(listing, criteria.excludeKeywords ?? [])) return null;

  const { score, reasons, matchedKeyword, locationMatched, isRemote } = scoreListing(listing, criteria);
  const keywordHitCount = reasons.filter((r) => r.startsWith("matches keyword")).length;
  const floor = options?.scoreFloor ?? 20;

  // Location required: explicit locations + not remote-only => any non-remote
  // listing must match a saved location. Remote listings are exempt.
  const hasLocationIntent = !criteria.remoteOnly && criteria.locations.length > 0;
  const locationSatisfied = isRemote || locationMatched;
  if (hasLocationIntent && !locationSatisfied) return null;

  const passes =
    matchedKeyword &&
    score >= floor &&
    (locationMatched || keywordHitCount >= 2);

  return passes ? { score, reasons } : null;
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

      const curated = curatedMatchCheck(listing, criteria);
      if (!curated) continue;
      const { score, reasons } = curated;

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