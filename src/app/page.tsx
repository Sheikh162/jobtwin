import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMatchQueue, getQueueStats } from "@/lib/queue";
import { AppShell } from "@/components/app-shell";
import { MatchCard } from "@/components/match-card";
import { EmptyQueue } from "@/components/empty-queue";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export default async function QueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const [matches, stats] = await Promise.all([
    getMatchQueue(session.user.id),
    getQueueStats(session.user.id),
  ]);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Your review queue</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {stats.pending > 0 ? `${stats.pending} to review` : "Queue clear"}
          </h1>
        </div>
        <Link href="/criteria">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Criteria
          </Button>
        </Link>
      </div>

      {matches.length === 0 ? (
        <EmptyQueue hasAnyDecision={stats.approved + stats.rejected + stats.applied > 0} />
      ) : (
        <div>
          {matches.map((m, i) => (
            <MatchCard
              key={m.id}
              match={m}
              isLast={i === matches.length - 1}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}