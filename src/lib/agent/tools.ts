import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getQueueStats } from "@/lib/queue";
import { revalidatePendingMatches } from "@/agent/revalidate";
import { runMatchingEngine } from "@/agent/matcher";

// ---------------------------------------------------------------------------
// Tool invocation contract. Each tool is described to the LLM (for tool
// selection) and has a handler that executes real, per-user work.
// ---------------------------------------------------------------------------

export interface AgentToolResult {
  tool: string;
  summary: string; // one-line what it did, shown as a badge in the UI
  data: unknown; // structured data fed back to the LLM
  changed?: boolean; // true when the tool mutated the user's state (criteria etc.)
}

const ToolSelectionSchema = z.object({
  tool: z.string().nullish().default(null),
  args: z.record(z.string(), z.unknown()).nullish().default({}),
});

export type ToolArg = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tool handlers (all scoped to userId — the "one engine, N twins" rule)
// ---------------------------------------------------------------------------

async function queueSummary(userId: string): Promise<AgentToolResult> {
  const [stats, matches] = await Promise.all([
    getQueueStats(userId),
    prisma.match.findMany({
      where: { userId, status: MatchStatus.PENDING },
      orderBy: { score: "desc" },
      take: 8,
      include: { listing: { include: { company: { select: { name: true } } } } },
    }),
  ]);

  return {
    tool: "get_queue_summary",
    summary: `Queue: ${stats.pending} pending, ${stats.approved} approved, ${stats.rejected} rejected, ${stats.applied} applied`,
    data: {
      stats,
      topMatches: matches.map((m) => ({
        title: m.listing.title,
        company: m.listing.company.name,
        score: m.score,
      })),
    },
  };
}

async function matchDetails(userId: string, args: ToolArg): Promise<AgentToolResult> {
  // The LLM sometimes inserts spaces when transcribing ids — strip them.
  const matchId = String(args.matchId ?? "").replace(/[\s-]/g, "");
  let match = await prisma.match.findFirst({
    where: { id: matchId, userId },
    include: {
      listing: { include: { company: { select: { name: true, logoUrl: true } } } },
      criteria: { select: { name: true } },
    },
  });

  // Fall back to a prefix match for truncated ids.
  if (!match && matchId.length >= 6) {
    match = await prisma.match.findFirst({
      where: { id: { startsWith: matchId }, userId },
      include: {
        listing: { include: { company: { select: { name: true, logoUrl: true } } } },
        criteria: { select: { name: true } },
      },
    });
  }

  if (!match) {
    return {
      tool: "get_match_details",
      summary: "Match not found for this user",
      data: { error: "Match not found" },
    };
  }

  const reasons = (match.reasons ?? {}) as Record<string, unknown>;

  return {
    tool: "get_match_details",
    summary: `Details for: ${match.listing.title}`,
    data: {
      id: match.id,
      title: match.listing.title,
      company: match.listing.company.name,
      location: match.listing.location,
      applyUrl: match.listing.applyUrl,
      source: match.listing.source,
      score: match.score,
      status: match.status,
      reasons,
      criteria: match.criteria?.name ?? null,
      description: match.listing.description?.slice(0, 400) ?? null,
    },
  };
}

async function getCriteria(userId: string): Promise<AgentToolResult> {
  const criteria = await prisma.searchCriteria.findFirst({ where: { userId } });

  return {
    tool: "get_criteria",
    summary: criteria ? `Criteria: ${criteria.name}` : "No criteria saved yet",
    data: criteria
      ? {
          name: criteria.name,
          keywords: criteria.keywords,
          locations: criteria.locations,
          remoteOnly: criteria.remoteOnly,
          minSalary: criteria.minSalary,
        }
      : null,
  };
}

async function applicationSummary(userId: string): Promise<AgentToolResult> {
  const apps = await prisma.application.findMany({
    where: { userId },
    include: {
      listing: { include: { company: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const byStatus = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    tool: "get_application_summary",
    summary: `Applications: ${apps.length}`,
    data: {
      byStatus,
      recent: apps.map((a) => ({
        title: a.listing.title,
        company: a.listing.company.name,
        status: a.status,
      })),
    },
  };
}

async function checkCompany(userId: string, args: ToolArg): Promise<AgentToolResult> {
  const companyName = String(args.name ?? "").trim();
  if (!companyName) {
    return {
      tool: "check_company",
      summary: "No company name given",
      data: { error: "Provide a company name, e.g. Vercel" },
    };
  }

  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const existing = await prisma.company.findFirst({
    where: { OR: [{ slug }, { name: { equals: companyName, mode: "insensitive" } }] },
    select: { id: true, name: true, careersPageUrl: true, seedActive: true, lastCrawlAt: true },
  });

  let company = existing;
  if (!company) {
    // Derive a careers page guess; the crawler will detect the actual ATS.
    const domain = slug.replace(/-/g, "");
    company = await prisma.company.upsert({
      where: { slug },
      create: {
        name: companyName,
        slug,
        careersPageUrl: `https://${domain}.com/careers`,
        seedActive: true,
      },
      update: {},
      select: { id: true, name: true, careersPageUrl: true, seedActive: true, lastCrawlAt: true },
    });
    console.log(`[agent] check_company: created ${company.name} (${slug}) for user ${userId}`);
  } else if (!company.seedActive) {
    await prisma.company.update({ where: { id: company.id }, data: { seedActive: true } });
  }

  // Enqueue a crawl job for this company (reuses the daemon's queue).
  const { queues } = await import("@/agent/queue");
  await queues.crawl.add(
    "crawl-company",
    { companyId: company.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
    }
  );

  return {
    tool: "check_company",
    summary: `Queued a crawl for ${company.name}`,
    data: {
      company: company.name,
      careersPageUrl: company.careersPageUrl,
      lastCrawlAt: company.lastCrawlAt,
      note: "Crawl enqueued — refresh the review queue in a minute for new matches.",
    },
  };
}

// ---------------------------------------------------------------------------
// Criteria mutation tools — the "direct the agent" surface. The agent can
// change what it hunts for and the queue re-conforms immediately.
// ---------------------------------------------------------------------------

const CriteriaFieldOpSchema = z.object({
  op: z.enum(["add", "remove", "set"]),
  values: z.array(z.string()).default([]),
});

type CriteriaFieldOp = z.infer<typeof CriteriaFieldOpSchema>;

async function applyFieldOp(current: string[], op: CriteriaFieldOp): Promise<string[]> {
  const values = op.values.map((v) => v.trim()).filter(Boolean);
  switch (op.op) {
    case "add":
      return [...new Set([...current, ...values])];
    case "remove":
      return current.filter((c) => !values.includes(c));
    case "set":
      return [...new Set(values)];
  }
}

/** Normalize criteria rows for snapshotting/restoring (strip the undo field). */
function snapshotOf(c: {
  name: string;
  keywords: string[];
  excludeKeywords: string[];
  locations: string[];
  remoteOnly: boolean;
  minSalary: number | null;
  active: boolean;
}) {
  return {
    name: c.name,
    keywords: c.keywords,
    excludeKeywords: c.excludeKeywords,
    locations: c.locations,
    remoteOnly: c.remoteOnly,
    minSalary: c.minSalary,
    active: c.active,
  };
}

/** Re-conform the queue after a criteria change (revalidate + match new). */
async function reconformQueue(userId: string) {
  await revalidatePendingMatches(userId);
  await runMatchingEngine();
  return getQueueStats(userId);
}

async function updateCriteria(userId: string, args: ToolArg): Promise<AgentToolResult> {
  let criteria = await prisma.searchCriteria.findFirst({ where: { userId } });
  if (!criteria) {
    criteria = await prisma.searchCriteria.create({
      data: { userId, name: "My criteria" },
    });
  }

  const ops = args as {
    name?: string;
    keywords?: { op: string; values?: string[] };
    excludeKeywords?: { op: string; values?: string[] };
    locations?: { op: string; values?: string[] };
    remoteOnly?: boolean;
    minSalary?: number | null;
  };

  const parseOp = (raw: { op: string; values?: string[] } | undefined) => {
    if (!raw) return undefined;
    const parsed = CriteriaFieldOpSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };

  const before = snapshotOf(criteria);

  const keywordsOp = parseOp(ops.keywords);
  const excludeOp = parseOp(ops.excludeKeywords);
  const locationsOp = parseOp(ops.locations);

  const keywords = keywordsOp ? await applyFieldOp(criteria.keywords ?? [], keywordsOp) : (criteria.keywords ?? []);
  const excludeKeywords = excludeOp
    ? await applyFieldOp(criteria.excludeKeywords ?? [], excludeOp)
    : (criteria.excludeKeywords ?? []);
  const locations = locationsOp ? await applyFieldOp(criteria.locations ?? [], locationsOp) : (criteria.locations ?? []);
  const remoteOnly = ops.remoteOnly !== undefined ? ops.remoteOnly : criteria.remoteOnly;
  const minSalary = ops.minSalary !== undefined ? ops.minSalary : criteria.minSalary;
  const name = ops.name ?? criteria.name;

  const updated = await prisma.searchCriteria.update({
    where: { id: criteria.id },
    data: {
      name,
      keywords,
      excludeKeywords,
      locations,
      remoteOnly,
      minSalary,
      previousState: JSON.parse(JSON.stringify(before)),
    },
  });

  const queueAfter = await reconformQueue(userId);

  return {
    tool: "update_criteria",
    changed: true,
    summary: `Criteria updated: ${name}`,
    data: {
      before,
      after: snapshotOf(updated),
      queueAfter,
      note: "Queue re-conformed to the new criteria.",
    },
  };
}

async function restoreCriteria(userId: string): Promise<AgentToolResult> {
  const criteria = await prisma.searchCriteria.findFirst({ where: { userId } });
  if (!criteria?.previousState) {
    return {
      tool: "restore_criteria",
      summary: "Nothing to restore",
      data: { error: "No previous criteria state to restore" },
    };
  }

  const prev = criteria.previousState as Record<string, unknown>;
  const updated = await prisma.searchCriteria.update({
    where: { id: criteria.id },
    data: {
      name: String(prev.name ?? criteria.name),
      keywords: (prev.keywords as string[]) ?? criteria.keywords,
      excludeKeywords: (prev.excludeKeywords as string[]) ?? criteria.excludeKeywords,
      locations: (prev.locations as string[]) ?? criteria.locations,
      remoteOnly: Boolean(prev.remoteOnly ?? criteria.remoteOnly),
      minSalary: (prev.minSalary as number | null) ?? criteria.minSalary,
      active: Boolean(prev.active ?? criteria.active),
      previousState: Prisma.DbNull,
    },
  });

  const queueAfter = await reconformQueue(userId);

  return {
    tool: "restore_criteria",
    changed: true,
    summary: "Criteria restored to previous state",
    data: { after: snapshotOf(updated), queueAfter },
  };
}

async function setMatchingActive(userId: string, args: ToolArg): Promise<AgentToolResult> {
  const active = args.active !== false;
  const criteria = await prisma.searchCriteria.findFirst({ where: { userId } });
  if (!criteria) {
    return {
      tool: active ? "resume_matching" : "pause_matching",
      summary: "No criteria yet",
      data: { error: "No criteria saved yet." },
    };
  }
  await prisma.searchCriteria.update({ where: { id: criteria.id }, data: { active } });
  return {
    tool: active ? "resume_matching" : "pause_matching",
    changed: true,
    summary: active ? "Matching resumed" : "Matching paused",
    data: { active, note: active ? "New matches will appear again." : "No new matches until resumed; existing queue stays." },
  };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export const AGENT_TOOLS = {
  get_queue_summary: { handler: queueSummary, args: z.object({}).describe("No args") },
  get_match_details: {
    handler: matchDetails,
    args: z.object({ matchId: z.string().describe("The match id shown in the review queue") }),
  },
  get_criteria: { handler: getCriteria, args: z.object({}).describe("No args") },
  get_application_summary: { handler: applicationSummary, args: z.object({}).describe("No args") },
  check_company: {
    handler: checkCompany,
    args: z.object({ name: z.string().describe("Company name, e.g. Stripe or Vercel") }),
  },
  update_criteria: {
    handler: updateCriteria,
    args: z.object({}).describe("Partial criteria changes with per-field ops"),
  },
  restore_criteria: { handler: restoreCriteria, args: z.object({}).describe("No args") },
  pause_matching: {
    handler: setMatchingActive,
    args: z.object({ active: z.literal(false).describe("Pause matching") }),
  },
  resume_matching: {
    handler: setMatchingActive,
    args: z.object({ active: z.literal(true).describe("Resume matching") }),
  },
} as const;

export const TOOL_DESCRIPTIONS: Array<{ name: string; description: string }> = [
  { name: "get_queue_summary", description: "Summarize the user's review queue: pending matches, stats, top roles." },
  { name: "get_match_details", description: "Get details (reasons, location, apply URL, score) for one match by id." },
  { name: "get_criteria", description: "Get the user's saved search criteria." },
  { name: "get_application_summary", description: "Summarize the user's application statuses." },
  { name: "check_company", description: "Kick off a live crawl of a company's careers page to see what jobs it has now." },
  { name: "update_criteria", description: "CHANGE what the agent hunts for. Per-field ops {op: add|remove|set, values}. Fields: keywords, excludeKeywords (never match these), locations, remoteOnly (boolean), minSalary (number), name. The queue re-conforms immediately." },
  { name: "restore_criteria", description: "Undo the last criteria change — restore the previous saved criteria." },
  { name: "pause_matching", description: "Stop producing new matches until resumed (existing queue stays)." },
  { name: "resume_matching", description: "Resume producing new matches after a pause." },
];

export { ToolSelectionSchema };