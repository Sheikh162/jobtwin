import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getMatchQueue,
  getQueueStats,
  getExpiredMatches,
  getMatchDetail,
} from "@/lib/queue";
import { AppShell } from "@/components/app-shell";
import { MatchDetail } from "@/components/match-detail";
import { MatchRow } from "@/components/match-row";
import { EmptyQueue } from "@/components/empty-queue";
import { QueueFilters } from "@/components/queue-filters";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronDown } from "lucide-react";

const PAGE_SIZE = 20;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/welcome");
  const params = await searchParams;

  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);

  const page = Math.max(parseInt(get("page") ?? "1", 10) || 1, 1);
  const companyId = get("company") || null;
  const location = get("location") || null;
  const remoteOnly = get("remote") === "1" ? true : null;
  const minScore = get("minScore") ? Number(get("minScore")) : null;
  const matchedWithinDays = get("within") ? Number(get("within")) : null;
  const sort = (get("sort") as "fresh" | "score" | "blended") ?? "fresh";
  const selectedId = get("selected") || null;

  const [companies, result, stats] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getMatchQueue(session.user.id, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      companyId,
      location,
      remoteOnly,
      minScore,
      matchedWithinDays,
      sort,
    }),
    getQueueStats(session.user.id),
  ]);

  const selected =
    selectedId && result.matches.length > 0
      ? (await getMatchDetail(session.user.id, selectedId)) ?? result.matches[0] ?? null
      : result.matches[0] ?? null;

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Your review queue</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {result.total > 0 ? `${result.total} to review` : "Queue clear"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stats.expired > 0 ? `${stats.expired} expired · ` : ""}
            {result.matches.length} shown
          </p>
        </div>
        <Link href="/criteria">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Criteria
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <QueueFilters companies={companies} />
      </div>

      {result.total === 0 ? (
        <EmptyQueue hasAnyDecision={stats.approved + stats.applied + stats.rejected > 0} />
      ) : (
        <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start">
          {/* List — dense rows (desktop selects via searchParams; mobile taps below) */}
          <div className="hidden space-y-1.5 lg:sticky lg:top-6 lg:block">
            {result.matches.map((m) => (
              <Link key={m.id} href={`/?${new URLSearchParams({ ...stringifyParams(params), selected: m.id })}`} prefetch={false}>
                <MatchRow match={m} selected={selected?.id === m.id} />
              </Link>
            ))}
          </div>

          {/* Detail pane (desktop right column; mobile stacked below rows) */}
          <div>
            {selected ? (
              <MatchDetail match={selected} />
            ) : (
              <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                Select a match to review.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile list (stacked above detail via links) */}
      {result.total > 0 && (
        <div className="mt-6 space-y-1.5 lg:hidden">
          {result.matches.map((m) => (
            <Link key={m.id} href={`/?${new URLSearchParams({ ...stringifyParams(params), selected: m.id })}`} prefetch={false}>
              <MatchRow match={m} selected={selected?.id === m.id} />
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {result.hasMore && (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/?${new URLSearchParams({ ...stringifyParams(params), page: String(page + 1) })}`}
            prefetch={false}
          >
            <Button variant="outline" className="w-full lg:w-auto">Load more</Button>
          </Link>
        </div>
      )}

      {/* Expired section — collapsed, low priority */}
      {stats.expired > 0 && (
        <ExpiredSection userId={session.user.id} count={stats.expired} />
      )}
    </AppShell>
  );
}

async function ExpiredSection({ userId, count }: { userId: string; count: number }) {
  const expired = await getExpiredMatches(userId, 5);
  return (
    <details className="mt-8">
      <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <ChevronDown className="h-4 w-4" />
        Expired ({count})
      </summary>
      <div className="mt-2 space-y-1.5 opacity-60">
        {expired.map((m) => (
          <div key={m.id} className="rounded-xl border px-3 py-2 text-sm">
            <span className="font-medium">{m.listing.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">{m.listing.company.name}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function stringifyParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}