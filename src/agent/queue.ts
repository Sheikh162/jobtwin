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
    }))
  );
}