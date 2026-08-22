import { z } from "zod";
import { llmStructured } from "@/lib/llm";

// Fields are `.nullish()` so a model that omits a key (deepseek v4 flash
// sometimes returns `name` instead of `fullName`, or drops a field entirely)
// still validates — model output is nondeterministic about key names.
export const ResumeProfileSchema = z.object({
  fullName: z.string().nullish().default(null),
  headline: z.string().nullish().default(null),
  summary: z.string().nullish().default(null),
  skills: z.array(z.string()).default([]),
  yearsOfExperience: z.number().nullish().default(null),
  education: z
    .array(
      z.object({
        institution: z.string().default(""),
        degree: z.string().nullish().default(null),
        field: z.string().nullish().default(null),
        year: z.number().nullish().default(null),
      })
    )
    .default([]),
  workHistory: z
    .array(
      z.object({
        company: z.string().default("Unknown"),
        title: z.string().default(""),
        years: z.string().nullish().default(null),
      })
    )
    .default([]),
  githubUsername: z.string().nullish().default(null),
});

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

/**
 * Normalize common LLM output variants into canonical keys before Zod
 * validation. Cheap alias mapping + type coercion, never invented data.
 */
export function normalizeResumeOutput(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = raw as Record<string, unknown>;

  return {
    fullName: r.fullName ?? r.name ?? r.full_name ?? null,
    headline: r.headline ?? r.title ?? r.current_title ?? null,
    summary: r.summary ?? r.about ?? r.profileSummary ?? null,
    skills:
      Array.isArray(r.skills)
        ? r.skills.map(String)
        : typeof r.skills === "string"
          ? (r.skills as string).split(/[,;]\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean)
          : Array.isArray(r.technicalSkills)
            ? (r.technicalSkills as unknown[]).map(String)
            : [],
    yearsOfExperience:
      typeof r.yearsOfExperience === "number" ? r.yearsOfExperience : null,
    education:
      Array.isArray(r.education)
        ? (r.education as unknown[]).map((e) => {
            const x = e as Record<string, unknown>;
            return {
              institution: x.institution ?? x.school ?? x.university ?? "Unknown",
              degree: x.degree ?? null,
              field: x.field ?? x.major ?? null,
              year:
                typeof x.year === "number" ? x.year
                : typeof x.graduationYear === "number" ? x.graduationYear
                : null,
            };
          })
        : [],
    workHistory:
      Array.isArray(r.workHistory)
        ? (r.workHistory as unknown[]).map((w) => {
            const x = w as Record<string, unknown>;
            return {
              company: x.company ?? x.employer ?? "Unknown",
              title: x.title ?? x.role ?? "",
              years: x.years ?? x.period ?? x.duration ?? null,
            };
          })
        : Array.isArray(r.experience)
          ? (r.experience as unknown[]).map((w) => {
              const x = w as Record<string, unknown>;
              return {
                company: x.company ?? x.employer ?? "Unknown",
                title: x.title ?? x.role ?? "",
                years: x.years ?? x.date ?? x.duration ?? null,
              };
            })
          : [],
    githubUsername:
      r.githubUsername ?? r.github ?? r.github_user ?? r.githubUser ?? null,
  };
}

const PARSE_SYSTEM = [
  "You parse a job seeker's resume into a structured professional profile.",
  "Extract only what is actually present — never invent skills or companies.",
  "Return the strict schema object. Use null for missing values, empty arrays for none.",
].join("\n");

const PARSE_SCHEMA_DESCRIPTION = `{
  "fullName": string | null,
  "headline": string | null,
  "summary": string | null,
  "skills": string[],
  "yearsOfExperience": number | null,
  "education": [{ "institution": string, "degree": string | null, "field": string | null, "year": number | null }],
  "workHistory": [{ "company": string, "title": string, "years": string | null }],
  "githubUsername": string | null
}`;

/** AI-parses raw resume text into a structured profile. */
export async function parseResume(text: string) {
  const raw = await llmStructured(z.record(z.string(), z.unknown()), {
    system: PARSE_SYSTEM,
    user: `Resume text:\n\n${text.slice(0, 20000)}`,
    maxTokens: 4096,
    schemaDescription: PARSE_SCHEMA_DESCRIPTION,
    raw: true,
  });
  return ResumeProfileSchema.parse(normalizeResumeOutput(raw));
}