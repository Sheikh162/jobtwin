import { prisma } from "@/lib/prisma";
import { MatchStatus, ListingStatus } from "@/generated/prisma/enums";

const DEFAULT_EXPIRE_DAYS = 14;

/**
 * Staleness lifecycle: a bounded queue that only grows isn't bounded. Move
 * PENDING matches out of the queue when they go stale:
 *  1. Their listing has CLOSED (company took it down) — the match is dead.
 *  2. They've sat undecided past the age threshold (default 14 days) — the
 *     early-applicant window is long gone; applying now is near-worthless
 *     under the product's own real-time-timing rationale.
 *
 * Expired matches are NOT deleted — they surface in a collapsed section so the
 * history stays recoverable.
 */
export async function expireStaleMatches(options?: { ageDays?: number }): Promise<number> {
  const ageDays = options?.ageDays ?? DEFAULT_EXPIRE_DAYS;
  const cutoff = new Date(Date.now() - ageDays * 86400000);

  // 1) Matches whose listing has closed, still sitting PENDING.
  const closedListingResult = await prisma.match.updateMany({
    where: { status: MatchStatus.PENDING, listing: { status: ListingStatus.CLOSED } },
    data: { status: MatchStatus.EXPIRED },
  });

  // 2) Matches past the age threshold, still PENDING.
  const agedOutResult = await prisma.match.updateMany({
    where: { status: MatchStatus.PENDING, createdAt: { lt: cutoff } },
    data: { status: MatchStatus.EXPIRED },
  });

  const total = closedListingResult.count + agedOutResult.count;
  if (total > 0) {
    console.log(`[staleness] expired ${total} matches (${closedListingResult.count} from closed listings, ${agedOutResult.count} aged > ${ageDays}d)`);
  }
  return total;
}