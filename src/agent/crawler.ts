import { chromium } from "playwright";
import { llmStructured } from "@/lib/llm";
import {
  ListingCandidate,
  ExtractionSchema,
  detectAtsFromHtml,
  fetchFromAts,
} from "@/agent/ats";

const EXTRACTION_SYSTEM = [
  "You extract structured job listings from raw career-page HTML.",
  "Rules:",
  "- Only extract real job postings visible in the page content; ignore nav, footer, boilerplate.",
  "- externalId MUST be stable across crawls for the same job (use URL slug / job id from the apply link or listing anchor).",
  "- If the page has a job board embedded (Greenhouse/Lever/Ashby/Workday iframe or widget), extract from the embedded data.",
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

/**
 * Fetch listings for a company's careers page.
 *
 * Strategy:
 *  1. Fetch the raw HTML and detect a known ATS (Greenhouse/Ashby/Lever).
 *  2. If found, call its public job-board API — structured, fast, reliable.
 *  3. Otherwise, render with Playwright and LLM-extract from the page text
 *     (handles bespoke JS-heavy boards like Ramp's custom app).
 */
export async function fetchAndExtractListings(companyName: string, careersUrl: string): Promise<ListingCandidate[] | null> {
  const html = await fetchPageHtml(careersUrl);
  if (!html) {
    // The page could not be fetched at all (network error / non-200). This is
    // NOT evidence that the company has no jobs — callers must not treat it as
    // a close signal. We return null to distinguish "failed" from "empty".
    console.warn(`[crawl] ${companyName} — page fetch failed, not treating as empty`);
    return null;
  }

  const ats = detectAtsFromHtml(html);
  if (ats.ats) {
    console.log(`[ats] ${ats.ats}/${ats.boardToken} detected for ${companyName}`);
    const listings = await fetchFromAts(ats);
    if (listings && listings.length > 0) {
      return listings;
    }
    // Board reached but returned nothing — do NOT fall through to the browser
    // fallback for ATS pages (the ATS path either works or it doesn't; an
    // empty ATS result usually means the board token is valid but empty).
    if (listings !== null) return listings;
  }

  // Fallback: render with a browser and let the LLM pull listings out.
  return llmExtractFromPage(companyName, careersUrl);
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Jobtwin/0.1)" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`[company] fetch ${url} failed:`, (err as Error).message);
    return null;
  }
}

async function llmExtractFromPage(companyName: string, careersUrl: string): Promise<ListingCandidate[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(careersUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

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
        body: document.body?.innerText?.slice(0, 16000),
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
      // No explicit model: llmStructured resolves the active provider's model
      // (DEEPSEEK_MODEL / OPENROUTER_MODEL) via llmEnv.
      maxTokens: 4000,
      schemaDescription: EXTRACTION_SCHEMA_DESCRIPTION,
    });

    return result.listings;
  } finally {
    await browser.close();
  }
}