import "dotenv/config";
import { connection, queues } from "@/agent/queue";
import { startCrawlWorker } from "@/agent/crawlWorker";
import { prisma } from "@/lib/prisma";

const intervalMs = Number(process.env.AGENT_CRAWL_INTERVAL_MS ?? 900000);

const worker = startCrawlWorker();

async function main() {
  // Persistent loop: a JobScheduler fires the crawl+cycle job on a fixed
  // interval. Redis holds the scheduler, so the interval (and any pending job)
  // survives process restarts — same shape a cloud deploy would use later.
  await queues.crawl.upsertJobScheduler("crawl-cycle", { every: intervalMs }, {
    name: "crawl-cycle",
    data: {},
    opts: {},
  });

  // Kick an immediate cycle so the daemon doesn't idle until the first tick.
  await queues.crawl.add("crawl-cycle", { immediate: true });
  console.log(`[agent] daemon active — crawl cycle every ${Math.round(intervalMs / 60000)} minutes`);
}

main().catch((err) => {
  console.error("[agent] failed to start:", err);
  process.exitCode = 1;
});

async function shutdown(signal: string) {
  console.log(`[agent] received ${signal} — shutting down`);
  await worker.close();
  await queues.crawl.close().catch(() => {});
  await queues.notify.close().catch(() => {});
  await connection.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));