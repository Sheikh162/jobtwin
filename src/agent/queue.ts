import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  maxRetriesPerRequest: null,
});

export const queues = {
  crawl: new Queue("crawl", { connection }),
  notify: new Queue("notify", { connection }),
};

export async function scheduleCrawlJobs(companyIds: string[]) {
  await queues.crawl.addBulk(
    companyIds.map((companyId) => ({
      name: "crawl-company",
      data: { companyId },
      // Transient network failures must not silently lose a crawl — retry with
      // exponential-ish backoff before giving up (BullMQ built-in backoff).
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
      },
    }))
  );
}