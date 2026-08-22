import OpenAI from "openai";
import { z } from "zod";

type Provider = "deepseek" | "openrouter";

function activeProvider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  return p === "openrouter" ? "openrouter" : "deepseek";
}

export const llmEnv = {
  get baseURL() {
    if (activeProvider() === "openrouter") {
      return process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
    }
    // DeepSeek direct API (OpenAI-compatible). The SDK appends /chat/completions.
    return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  },
  get apiKey() {
    if (activeProvider() === "openrouter") {
      if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
      return process.env.OPENROUTER_API_KEY;
    }
    if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not set");
    return process.env.DEEPSEEK_API_KEY;
  },
  get model() {
    if (activeProvider() === "openrouter") {
      return process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731";
    }
    return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  },
  get extractionModel() {
    return process.env.LLM_EXTRACTION_MODEL ?? this.model;
  },
};

function client() {
  return new OpenAI({
    baseURL: llmEnv.baseURL,
    apiKey: llmEnv.apiKey,
    // Some provider paths are flaky from this dev machine; let the
    // SDK absorb transient connection errors with its own retry + backoff.
    timeout: 120_000,
    maxRetries: 3,
  });
}

interface LlmStructuredParams {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Human-readable description of the schema, injected into the prompt. */
  schemaDescription?: string;
  /** Return the raw parsed object instead of validating against the schema. */
  raw?: boolean;
}

/**
 * Run an LLM call with strict JSON output, validated against a Zod schema.
 *
 * Uses JSON mode (OpenRouter/DeepSeek `response_format: json_object`) with the
 * schema serialized into the system prompt, then validates with Zod. Wrappers
 * like {"value":...}/{"result":...} are unwrapped before validation.
 */
export async function llmStructured<T>(
  schema: z.ZodType<T>,
  params: LlmStructuredParams & { schemaDescription: string }
): Promise<T> {
  const c = client();
  const model = params.model ?? llmEnv.model;

  const schemaPreview = params.schemaDescription;
  const validate = params.raw
    ? (parsed: Record<string, unknown>) => parsed as unknown as T
    : (parsed: Record<string, unknown>) => validateInner(parsed, schema);

  const messages = [
    {
      role: "system" as const,
      content: [
        params.system,
        "",
        "You MUST reply with a single valid JSON object (no prose, no markdown fenced blocks).",
        "The JSON must match this shape exactly — include every key, using null for missing values:",
        schemaPreview,
      ].join("\n"),
    },
    { role: "user" as const, content: params.user },
  ];

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await c.chat.completions.create({
        model,
        messages,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.2,
        response_format: { type: "json_object" },
      });

      const text = completion.choices[0]?.message?.content ?? "";
      const parsed = parseJsonLoose(text);
      if (!parsed) {
        lastErr = new Error(
          `LLM returned no parseable JSON (finish=${completion.choices[0]?.finish_reason})`
        );
        await sleep(1200);
        continue;
      }
      return validate(parsed);
    } catch (err) {
      lastErr = err as Error;
      await sleep(1200);
    }
  }
  throw lastErr ?? new Error("LLM call failed");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Unwrap {"value":…}/{"result":…} wrappers, then validate against the schema. */
function validateInner<T>(parsed: Record<string, unknown>, schema: z.ZodType<T>): T {
  const inner =
    typeof parsed.value !== "undefined" ? parsed.value
    : typeof parsed.result !== "undefined" ? parsed.result
    : parsed;
  return schema.parse(inner);
}

function parseJsonLoose(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  // Strip any stray fenced blocks.
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const v = JSON.parse(withoutFence);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    // Fallback: try to find a top-level {...} span.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(trimmed.slice(start, end + 1));
        return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Plain text completion (used for drafting referral asks, etc.)
 */
export async function llmText(params: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const c = client();
  const completion = await c.chat.completions.create({
    model: params.model ?? llmEnv.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    max_tokens: params.maxTokens ?? 1024,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}