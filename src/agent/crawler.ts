import { z } from "zod";
import { chromium } from "playwright";
import { llmStructured } from "@/lib/llm";

export const ListingCandidateSchema = z.object({
  externalId: z.string().describe("Stable identifier for the listing (URL slug, job id, etc.)"),
  title: z.string(),
  location: z.string().nullable(),
  applyUrl: z.string().url().nullable(),
  postedAt: z.string().nullable().describe("ISO date string if shown on page, else null"),
  description: z.string().nullable(),
});

export const ExtractionSchema = z.object({
  listings: z.array(ListingCandidateSchema).describe("All job listings found on the page"),
});

export type ListingCandidate = z.infer<typeof ListingCandidateSchema>;

const EXTRACTION_SYSTEM = [
  "You extract structured job listings from raw career-page HTML.",
  "Rules:",
  "- Only extract real job postings visible in the page content; ignore nav, footer, boilerplate.",
  "- externalId MUST be stable across crawls for the same job (use URL slug / job id from the apply link or listing anchor).",
  "- If the page has a job board embedded (Greenhouse/Lever/Workday iframe or embedded widget), extract from the embedded data.",
  "- location: 'Remote' counts as a location. null when not shown.",
  "- postedAt: ISO date string when shown, else null.",
  "- Return JSON matching the schema exactly.",
].join("\n");

const EXTRACTION_SCHEMA_DESCRIPTION = `{
  "listings": [
    {
      "externalId": string,
      "title": string,
      "location": string | null,
      "applyUrl": string | null,
      "postedAt": string | null,
      "description": string | null
    }
  ]
}`;

export async function fetchAndExtractListings(companyName: string, careersUrl: string): Promise<ListingCandidate[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(careersUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait a beat for JS-driven job boards to render.
    await page.waitForTimeout(4000);

    // Grab a text-ish snapshot. The LLM handles inconsistent layouts.
    const raw = await page.evaluate(() => {
      const jobs = Array.from(document.querySelectorAll('a[href*="/job"], a[href*="/jobs"], [data-job-id], [data-gh-attr], [data-js-job-id]'));
      const jobText = jobs
        .slice(0, 120)
        .map((el) => el.textContent?.trim().slice(0, 500) ?? "")
        .filter(Boolean)
        .join("\n---\n");
      return {
        url: location.href,
        title: document.title,
        jobText,
        body: document.body?.innerText?.slice(0, 12000),
      };
    });

    const userPrompt = [
      `Company: ${companyName}`,
      `Page URL: ${raw.url}`,
      `Page title: ${raw.title}`,
      "",
      "--- Candidate job anchors (text) ---",
      raw.jobText,
      "",
      "--- Full page text (truncated) ---",
      raw.body,
    ].join("\n");

    const result = await llmStructured(ExtractionSchema, {
      system: EXTRACTION_SYSTEM,
      user: userPrompt,
      model: llmEnvExtractionModel(),
      maxTokens: 4000,
      schemaDescription: EXTRACTION_SCHEMA_DESCRIPTION,
    });

    return result.listings;
  } finally {
    await browser.close();
  }
}

function llmEnvExtractionModel() {
  return process.env.LLM_EXTRACTION_MODEL ?? process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731";
}