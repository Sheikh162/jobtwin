import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export interface MatchQueueFilters {
  limit?: number;
  offset?: number;
  companyId?: string | null;
  location?: string | null;
  remoteOnly?: boolean | null;
  minScore?: number | null;
  matchedWithinDays?: number | null;
  sort?: "fresh" | "score" | "blended";
}

export interface MatchQueueResult {
  matches: MatchQueueRow[];
  total: number;
  hasMore: boolean;
}

const MATCH_INCLUDE = {
  listing: {
    include: {
      company: { select: { name: true, logoUrl: true, verificationStatus: true } },
    },
  },
  criteria: { select: { name: true } },
} as const;

export type MatchQueueRow = Prisma.MatchGetPayload<{ include: typeof MATCH_INCLUDE }> & {
  transparency: {
    responseRate: number | null;
    avgTimeToResponse: number | null;
    ghostingRate: number | null;
    sampleSize: number;
  } | null;
};

/**
 * Bounded review queue with filters: pending matches for a user, filtered and
 * sorted. The queue stays pre-vetted (bounded model) — filters are navigation,
 * not unbounded discovery.
 *
 * Sort options:
 *  - "fresh" (default): newest matches first. The product's real-time story is
 *    early-applicant timing, so what just appeared is what matters most.
 *  - "score": strongest criteria match first.
 *  - "blended": recency decay applied to score — a great match from a week ago
 *    ranks beside a good one from today.
 */
export async function getMatchQueue(
  userId: string,
  filters: MatchQueueFilters = {}
): Promise<MatchQueueResult> {
  const limit = Math.min(filters.limit ?? 20, 50);
  const offset = filters.offset ?? 0;
  const sort = filters.sort ?? "fresh";

  const where: Prisma.MatchWhereInput = {
    userId,
    status: MatchStatus.PENDING,
    ...(filters.companyId ? { listing: { companyId: filters.companyId } } : {}),
    ...(filters.location
      ? { listing: { location: { contains: filters.location, mode: "insensitive" } } }
      : {}),
    ...(filters.remoteOnly ? { listing: { location: { contains: "remote", mode: "insensitive" } } } : {}),
    ...(filters.minScore != null ? { score: { gte: filters.minScore } } : {}),
    ...(filters.matchedWithinDays != null
      ? { createdAt: { gte: new Date(Date.now() - filters.matchedWithinDays * 86400000) } }
      : {}),
  };

  const orderBy: Prisma.MatchOrderByWithRelationInput[] =
    sort === "score"
      ? [{ score: "desc" }, { createdAt: "desc" }]
      : sort === "blended"
        ? [{ score: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

  const [raw, total] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: MATCH_INCLUDE,
    }),
    prisma.match.count({ where }),
  ]);

  // Join transparency stats at decision time: for each listing's (companyId,
  // role) pair, pull the computed stats if they exist. When there's no data,
  // the card simply renders nothing (never a fabricated placeholder).
  const keys = raw.map((m) => ({
    companyId: m.listing.companyId,
    role: m.listing.title,
  }));
  const stats = await prisma.transparencyStats.findMany({
    where: {
      OR: keys.map((k) => ({ companyId: k.companyId, role: k.role })),
    },
  });
  const statByKey = new Map(stats.map((s) => [`${s.companyId}::${s.role}`, s]));

  return {
    matches: raw.map((m) => ({
      ...m,
      transparency: statByKey.get(`${m.listing.companyId}::${m.listing.title}`) ?? null,
    })),
    total,
    hasMore: offset + raw.length < total,
  };
}

/** Back-compat single-arg wrapper: queue for a user without filters. */
export async function getMatchQueueForUser(userId: string, limit = 20) {
  const { matches } = await getMatchQueue(userId, { limit });
  return matches;
}

/** Load full details incl. transparency for a single match (detail pane). */
export async function getMatchDetail(userId: string, matchId: string) {
  const m = await prisma.match.findFirst({ where: { id: matchId, userId }, include: MATCH_INCLUDE });
  if (!m) return null;
  const stats = await prisma.transparencyStats.findFirst({
    where: { companyId: m.listing.companyId, role: m.listing.title },
  });
  return { ...m, transparency: stats ?? null };
}

export async function getPendingCount(userId: string) {
  return prisma.match.count({ where: { userId, status: MatchStatus.PENDING } });
}

export async function getQueueStats(userId: string) {
  const [pending, approved, rejected, applied, expired] = await Promise.all([
    prisma.match.count({ where: { userId, status: MatchStatus.PENDING } }),
    prisma.match.count({ where: { userId, status: MatchStatus.APPROVED } }),
    prisma.match.count({ where: { userId, status: MatchStatus.REJECTED } }),
    prisma.match.count({ where: { userId, status: MatchStatus.APPLIED } }),
    prisma.match.count({ where: { userId, status: MatchStatus.EXPIRED } }),
  ]);
  return { pending, approved, rejected, applied, expired };
}

export async function getExpiredMatches(userId: string, limit = 20) {
  return prisma.match.findMany({
    where: { userId, status: MatchStatus.EXPIRED },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: MATCH_INCLUDE,
  });
}