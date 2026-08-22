import { scheduleCrawlJobs, queues } from "@/agent/queue";
import { runMatchingEngine } from "@/agent/matcher";
import { expireStaleMatches } from "@/agent/staleness";
import { prisma } from "@/lib/prisma";

let cycleRunning = false;

/**
 * One full crawl + match cycle: enqueue a crawl for every watched company,
 * wait for the crawl queue to drain, then run the matching engine so fresh
 * matches land in the review queue. Guarded against overlap — if a previous
 * cycle is still running, the tick is skipped rather than piled on.
 */
export async function runCrawlCycle() {
  if (cycleRunning) {
    console.log("[scheduler] previous cycle still running — skipping this tick");
    return;
  }
  cycleRunning = true;
  try {
    const companies = await prisma.company.findMany({
      where: { seedActive: true, careersPageUrl: { not: null } },
      select: { id: true },
    });
    console.log(`[scheduler] enqueuing crawl for ${companies.length} seed companies`);
    await scheduleCrawlJobs(companies.map((c) => c.id));
    if (companies.length === 0) {
      console.warn("[scheduler] no seed companies with careers pages — add companies via the app or seed script");
    }

    // Wait for in-flight CRAWLS to drain before matching. We wait only on
    // `crawl-company` jobs (waiting/active/delayed — delayed covers backoff
    // retries). The `crawl-cycle` job itself stays "active" while this cycle
    // runs, and the JobScheduler's own next tick is also named `crawl-cycle`,
    // so neither blocks matching.
    await new Promise<void>((resolve) => {
      const check = async () => {
        const inFlight = (await queues.crawl.getJobs(["waiting", "active", "delayed"]) ?? [])
          .filter((j) => j.name === "crawl-company");
        if (inFlight.length === 0) {
          resolve();
        } else {
          setTimeout(check, 5000);
        }
      };
      void check();
    });

    await runMatchingEngine();

    // Keep the queue actually bounded: expire closed-listing matches and
    // matches that aged out without a decision.
    await expireStaleMatches();
  } catch (err) {
    console.error("[scheduler] cycle failed:", err);
  } finally {
    cycleRunning = false;
  }
}