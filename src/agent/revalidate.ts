import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { curatedMatchCheck } from "@/agent/matcher";

/**
 * Revalidate the pending queue against the user's CURRENT criteria and EXPIRE
 * any match that no longer clears the curation gate.
 *
 * This keeps the queue self-healing: the moment a user edits criteria (adds or
 * removes locations/keywords), the next cycle conforms the queue to the new
 * intent. Expired matches are recoverable — they surface in the queue page's
 * collapsed "Expired (n)" section rather than being destroyed, preserving the
 * audit trail of what the agent surfaced (trust + matcher-feedback signal).
 *
 * Runs against the deterministic curatedMatchCheck gate (no LLM randomness,
 * no flapping).
 *
 * When userId is omitted, revalidates every user with active criteria.
 */
export async function revalidatePendingMatches(userId?: string): Promise<number> {
  const criteriaList = await prisma.searchCriteria.findMany({
    where: { active: true, ...(userId ? { userId } : {}) },
  });

  let expired = 0;
  for (const criteria of criteriaList) {
    const pending = await prisma.match.findMany({
      where: { userId: criteria.userId, status: MatchStatus.PENDING },
      select: {
        id: true,
        listing: { select: { title: true, location: true, description: true } },
      },
    });
    if (pending.length === 0) continue;

    const toExpire = pending.filter((m) => {
      const r = curatedMatchCheck(
        {
          title: m.listing.title,
          location: m.listing.location,
          description: m.listing.description,
        },
        {
          keywords: criteria.keywords,
          locations: criteria.locations,
          remoteOnly: criteria.remoteOnly,
        }
      );
      return r === null;
    });

    if (toExpire.length > 0) {
      const res = await prisma.match.updateMany({
        where: { id: { in: toExpire.map((m) => m.id) } },
        data: { status: MatchStatus.EXPIRED },
      });
      expired += res.count;
      console.log(
        `[revalidate] user ${criteria.userId} — expired ${res.count} of ${pending.length} pending (queue now conforms to criteria "${criteria.name}")`
      );
    }
  }

  if (expired > 0) console.log(`[revalidate] total expired: ${expired}`);
  return expired;
}