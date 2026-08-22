import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const seedCompanies = [
    {
      name: "Linear",
      slug: "linear",
      domain: "linear.app",
      careersPageUrl: "https://linear.app/careers",
      seedActive: true,
    },
    {
      name: "Vercel",
      slug: "vercel",
      domain: "vercel.com",
      careersPageUrl: "https://vercel.com/careers",
      seedActive: true,
    },
    {
      name: "Ramp",
      slug: "ramp",
      domain: "ramp.com",
      careersPageUrl: "https://ramp.com/careers",
      seedActive: true,
    },
    {
      name: "Notion",
      slug: "notion",
      domain: "notion.com",
      careersPageUrl: "https://notion.com/careers",
      seedActive: true,
    },
    {
      name: "Figma",
      slug: "figma",
      domain: "figma.com",
      careersPageUrl: "https://www.figma.com/careers/",
      seedActive: true,
    },
  ];

  for (const c of seedCompanies) {
    await prisma.company.upsert({
      where: { slug: c.slug },
      create: c,
      update: { careersPageUrl: c.careersPageUrl, seedActive: true },
    });
  }
  console.log(`Seeded ${seedCompanies.length} companies.`);

  const company = await prisma.company.findUnique({ where: { slug: "linear" } });
  if (company) {
    await prisma.listing.upsert({
      where: { companyId_externalId: { companyId: company.id, externalId: "demo-backend-engineer" } },
      create: {
        companyId: company.id,
        externalId: "demo-backend-engineer",
        title: "Backend Engineer",
        location: "San Francisco, CA",
        applyUrl: "https://linear.app/careers/backend-engineer",
        description:
          "Build the backend powering Linear's issue tracking. TypeScript, Postgres, Redis. You'll work on real-time sync and the public API.",
        source: "SOURCED",
      },
      update: {},
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());