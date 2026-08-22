import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function table(name: string, rows: unknown[], label?: string) {
  console.log(`\n=== ${name} (${rows.length})${label ? " — " + label : ""} ===`);
  for (const r of rows) console.log("  " + JSON.stringify(r));
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, githubUsername: true, resumeFileName: true, createdAt: true } });
  await table("USERS", users);

  const companies = await prisma.company.findMany({ select: { name: true, careersPageUrl: true, lastCrawlAt: true, verificationStatus: true } });
  await table("COMPANIES", companies);

  const listings = await prisma.listing.findMany({ select: { title: true, company: { select: { name: true } }, source: true, status: true } });
  await table("LISTINGS", listings);

  const matches = await prisma.match.findMany({ select: { listing: { select: { title: true } }, score: true, status: true } });
  await table("MATCHES", matches);

  const applications = await prisma.application.findMany({ select: { listing: { select: { title: true } }, status: true } });
  await table("APPLICATIONS", applications);

  const posts = await prisma.communityPost.findMany({ select: { pseudonym: true, body: true, role: true, tier: true } });
  await table("COMMUNITY POSTS", posts);

  const stats = await prisma.transparencyStats.findMany();
  await table("TRANSPARENCY STATS", stats);

  const channels = await prisma.notificationChannel.findMany({ select: { type: true, externalId: true, enabled: true } });
  await table("NOTIFICATION CHANNELS", channels);

  const sessions = await prisma.session.count();
  console.log(`\nsessions: ${sessions}`);
}

main()
  .catch((e) => console.error(e.message))
  .finally(() => prisma.$disconnect());