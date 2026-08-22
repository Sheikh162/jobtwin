import "dotenv/config";
import { scheduleCrawlJobs, connection, queues } from "@/agent/queue";
import { startCrawlWorker } from "@/agent/crawlWorker";
import { runMatchingEngine } from "@/agent/matcher";
import { prisma } from "@/lib/prisma";

async function enqueueSeedCrawl() {
  const companies = await prisma.company.findMany({
    where: { seedActive: true, careersPageUrl: { not: null } },
    select: { id: true },
  });
  console.log(`[scheduler] enqueuing crawl for ${companies.length} seed companies`);
  await scheduleCrawlJobs(companies.map((c) => c.id));
  return companies.length;
}

/**
 * Long-running agent process: enqueue a crawl cycle, wait for crawl workers to
 * drain, then run the matching engine so fresh matches land in the queue.
 */
async function runCycle() {
  const count = await enqueueSeedCrawl();
  if (count === 0) {
    console.warn("[scheduler] no seed companies with careers pages — add companies via the app or seed script");
  }

  // Wait for the crawl queue to drain before matching (new listings should exist).
  await new Promise<void>((resolve) => {
    const check = async () => {
      const counts = await queues.crawl.getJobCounts("waiting", "active", "delayed");
      if (counts.waiting + counts.active + counts.delayed === 0) {
        resolve();
      } else {
        setTimeout(check, 5000);
      }
    };
    void check();
  });

  await runMatchingEngine();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

const worker = startCrawlWorker();

// Run one full cycle now, then keep the worker alive for any manual enqueues.
runCycle().catch((err) => {
  console.error("[agent] cycle failed:", err);
  process.exitCode = 1;
});

export default worker;