import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";

/**
 * Bounded review queue: pending matches for a user, most recent first.
 * This is a queue of pre-vetted matches — not an infinite discovery feed.
 */
export async function getMatchQueue(userId: string, limit = 20) {
  return prisma.match.findMany({
    where: { userId, status: MatchStatus.PENDING },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      listing: {
        include: {
          company: { select: { name: true, logoUrl: true, verificationStatus: true } },
        },
      },
      criteria: { select: { name: true } },
    },
  });
}

export async function getPendingCount(userId: string) {
  return prisma.match.count({ where: { userId, status: MatchStatus.PENDING } });
}

export async function getQueueStats(userId: string) {
  const [pending, approved, rejected, applied] = await Promise.all([
    prisma.match.count({ where: { userId, status: MatchStatus.PENDING } }),
    prisma.match.count({ where: { userId, status: MatchStatus.APPROVED } }),
    prisma.match.count({ where: { userId, status: MatchStatus.REJECTED } }),
    prisma.match.count({ where: { userId, status: MatchStatus.APPLIED } }),
  ]);
  return { pending, approved, rejected, applied };
}