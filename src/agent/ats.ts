import { z } from "zod";

// The structured listing shape every ATS fetcher normalizes to. This is the
// same shape the LLM extraction path emits, so the differ/crawl worker treat
// all sources identically.
export const ListingCandidateSchema = z.object({
  externalId: z.string().describe("Stable identifier for the listing (URL slug, job id, etc.)"),
  title: z.string(),
  location: z.string().nullable(),
  applyUrl: z.string().url().nullable(),
  postedAt: z.string().nullable().describe("ISO date string if shown on page, else null"),
  description: z.string().nullable(),
});

export type ListingCandidate = z.infer<typeof ListingCandidateSchema>;

export const ExtractionSchema = z.object({
  listings: z.array(ListingCandidateSchema).describe("All job listings found on the page"),
});

export interface AtsInfo {
  ats: "greenhouse" | "ashby" | "lever" | null;
  boardToken: string | null;
}

/**
 * Detect which ATS a careers page uses and the board/company token, by scanning
 * the page for known ATS markers. Returns null token when the ATS is known but
 * the token can't be resolved.
 */
export function detectAtsFromHtml(html: string): AtsInfo {
  // Ashby: jobs.ashbyhq.com/<token>
  const ashby = /(?:jobs|api)\.ashbyhq\.com\/(?:org\/)?([a-z0-9_-]+)/i.exec(html);
  if (ashby) return { ats: "ashby", boardToken: ashby[1] };

  // Greenhouse: boards.greenhouse.io/<token> or boards-api.greenhouse.io/v1/boards/<token>
  const gh = /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([a-z0-9_-]+)/i.exec(html);
  if (gh) return { ats: "greenhouse", boardToken: gh[1] };

  // Lever: jobs.lever.co/<org>
  const lever = /jobs\.lever\.co\/([a-z0-9_-]+)/i.exec(html);
  if (lever) return { ats: "lever", boardToken: lever[1] };

  return { ats: null, boardToken: null };
}

/**
 * Fetch listings from a known ATS's public job-board API. Returns null when the
 * ATS is unsupported or the API call fails (caller falls back to LLM).
 */
export async function fetchFromAts(ats: AtsInfo): Promise<ListingCandidate[] | null> {
  if (!ats.ats || !ats.boardToken) return null;

  try {
    if (ats.ats === "greenhouse") {
      return await fetchGreenhouse(ats.boardToken);
    }
    if (ats.ats === "ashby") {
      return await fetchAshby(ats.boardToken);
    }
    if (ats.ats === "lever") {
      return await fetchLever(ats.boardToken);
    }
  } catch (err) {
    console.warn(`[ats] ${ats.ats}/${ats.boardToken} fetch failed:`, (err as Error).message);
    return null;
  }
  return null;
}

async function fetchGreenhouse(boardToken: string): Promise<ListingCandidate[] | null> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; Jobtwin/0.1)" }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: Array<{
    id?: number | string;
    title?: string;
    location?: { name?: string } | null;
    absolute_url?: string;
    first_published?: string;
    updated_at?: string;
    content?: string;
  }> };
  if (!data.jobs) return null;

  return data.jobs.map((j) => ({
    externalId: String(j.id ?? j.absolute_url ?? j.title),
    title: j.title ?? "Untitled",
    location: j.location?.name ?? null,
    applyUrl: j.absolute_url ?? null,
    postedAt: j.first_published ?? j.updated_at ?? null,
    description: stripHtml(j.content ?? null),
  }));
}

async function fetchAshby(boardToken: string): Promise<ListingCandidate[] | null> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; Jobtwin/0.1)" }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: Array<{
    id?: string;
    title?: string;
    location?: { name?: string } | string | null;
    jobUrl?: string;
    publishedAt?: string;
    updatedAt?: string;
    descriptionPlain?: string;
  }> };
  if (!data.jobs) return null;

  return data.jobs.map((j) => ({
    externalId: String(j.id ?? j.jobUrl ?? j.title),
    title: j.title ?? "Untitled",
    location: typeof j.location === "object" && j.location ? j.location.name ?? null : (typeof j.location === "string" ? j.location : null),
    applyUrl: j.jobUrl ?? null,
    postedAt: j.publishedAt ?? j.updatedAt ?? null,
    description: j.descriptionPlain ?? null,
  }));
}

async function fetchLever(boardToken: string): Promise<ListingCandidate[] | null> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${boardToken}?mode=json`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; Jobtwin/0.1)" }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    id?: string;
    text?: string;
    categories?: { location?: string; commitment?: string };
    hostedUrl?: string;
    createdAt?: number;
    additionalPlain?: string;
    descriptionPlain?: string;
  }>;
  if (!Array.isArray(data)) return null;

  return data.map((j) => ({
    externalId: String(j.id ?? j.hostedUrl ?? j.text),
    title: j.text ?? "Untitled",
    location: j.categories?.location ?? null,
    applyUrl: j.hostedUrl ?? null,
    postedAt: j.createdAt ? new Date(j.createdAt * 1000).toISOString() : null,
    description: j.descriptionPlain ?? j.additionalPlain ?? null,
  }));
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}