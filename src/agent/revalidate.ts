import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { curatedMatchCheck } from "@/agent/matcher";

/**
 * Revalidate the pending queue against the user's CURRENT criteria and
 * hard-delete any match that no longer clears the curation gate.
 *
 * This keeps the queue self-healing: the moment a user edits criteria (adds or
 * removes locations/keywords), the next cycle conforms the queue to the new
 * intent. Deletion is permanent — matches removed here are gone for good, so
 * this should only run against the deterministic curatedMatchCheck gate (it
 * does — no LLM randomness, no flapping).
 *
 * When userId is omitted, revalidates every user with active criteria.
 */
export async function revalidatePendingMatches(userId?: string): Promise<number> {
  const criteriaList = await prisma.searchCriteria.findMany({
    where: { active: true, ...(userId ? { userId } : {}) },
  });

  let deleted = 0;
  for (const criteria of criteriaList) {
    const pending = await prisma.match.findMany({
      where: { userId: criteria.userId, status: MatchStatus.PENDING },
      select: {
        id: true,
        listing: { select: { title: true, location: true, description: true } },
      },
    });
    if (pending.length === 0) continue;

    const toDelete = pending.filter((m) => {
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

    if (toDelete.length > 0) {
      const res = await prisma.match.deleteMany({
        where: { id: { in: toDelete.map((m) => m.id) } },
      });
      deleted += res.count;
      console.log(
        `[revalidate] user ${criteria.userId} — deleted ${res.count} of ${pending.length} pending (queue now conforms to criteria "${criteria.name}")`
      );
    }
  }

  if (deleted > 0) console.log(`[revalidate] total deleted: ${deleted}`);
  return deleted;
}