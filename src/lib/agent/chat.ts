import { llmStructured, llmText } from "@/lib/llm";
import { ToolSelectionSchema, AGENT_TOOLS, TOOL_DESCRIPTIONS, type AgentToolResult } from "@/lib/agent/tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentReply {
  reply: string;
  toolCalls: AgentToolResult[];
}

const MAX_TOOL_ROUNDS = 2;

const ACTIVITY_SYSTEM_PREFIX = [
  "You are the Jobtwin sourcing agent — a digital twin working for the person talking to you.",
  "",
  "You know only about THIS user. Use the tools to look at their real data; never invent",
  "job listings, stats, or actions. Be concise and concrete (2–4 sentences).",
  "",
  "Available tools:",
  ...TOOL_DESCRIPTIONS.map((t) => `- ${t.name}: ${t.description}`),
].join("\n");

/**
 * Run one agent turn: decide (using the LLM) whether a tool is needed, execute
 * it with per-user context, then produce the final answer. Cap tool rounds so
 * latency and cost stay bounded.
 */
export async function agentTurn(userId: string, messages: ChatMessage[]): Promise<AgentReply> {
  const toolCalls: AgentToolResult[] = [];
  let toolContext = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const decision = await decideTool(messages, toolContext);
    if (!decision.tool) break;

    const tool = AGENT_TOOLS[decision.tool as keyof typeof AGENT_TOOLS];
    if (!tool) break;

    let result: AgentToolResult;
    try {
      // Handlers are per-user; arguments come from the LLM but are validated
      // by each tool's Zod args schema inside its handler.
      result = await tool.handler(userId, (decision.args ?? {}) as Record<string, unknown>);
    } catch (err) {
      result = {
        tool: decision.tool,
        summary: `Tool failed: ${(err as Error).message}`,
        data: { error: (err as Error).message },
      };
    }
    toolCalls.push(result);
    toolContext += `\n[${result.tool}] ${JSON.stringify(result.data)}`;
  }

  const reply = await generateAnswer(messages, toolContext, toolCalls);
  return { reply, toolCalls };
}

const TOOL_ARG_HINTS = `{
  "get_queue_summary": {"args": {}},
  "get_match_details": {"args": {"matchId": "<id from the review queue>"}},
  "get_criteria": {"args": {}},
  "get_application_summary": {"args": {}},
  "check_company": {"args": {"name": "<exact company name, e.g. Stripe or Vercel>"}}
}`;

const SELECT_SYSTEM = [
  "Decide whether a tool would help answer the user's latest message.",
  "JSON only. Pick exactly one tool if it helps, or empty string if not (answer directly).",
  "Put the user's mentioned company/name into the args for that tool.",
].join("\n");

const SELECT_SCHEMA = `{
  "tool": string | null,
  "args": object
}`;

async function decideTool(
  messages: ChatMessage[],
  toolContext: string
): Promise<{ tool: string | null; args?: Record<string, unknown> }> {
  const last = messages[messages.length - 1]?.content ?? "";

  const decision = await llmStructured(ToolSelectionSchema, {
    system: [
      SELECT_SYSTEM,
      `Tool arg shapes:\n${TOOL_ARG_HINTS}`,
      `Descriptions:\n${TOOL_DESCRIPTIONS.map((t) => `${t.name}: ${t.description}`).join(" | ")}`,
    ].join("\n"),
    user: `${toolContext ? `Previous tool results:\n${toolContext}\n\n` : ""}User message: "${last}"`,
    maxTokens: 200,
    schemaDescription: SELECT_SCHEMA,
    temperature: 0,
  });

  return {
    tool: decision.tool ? String(decision.tool) : null,
    args: (decision.args ?? {}) as Record<string, unknown> | undefined,
  };
}

const ANSWER_SYSTEM = (toolContext: string) =>
  [
    ACTIVITY_SYSTEM_PREFIX,
    "",
    "Rules:",
    "- If you used tools, base your answer strictly on the tool results below.",
    "- Always answer the user's question. Tie it back to THEM (their queue, criteria, applications).",
    "- Never mention tool names or raw JSON in the answer.",
    ...(toolContext ? [`\nTool results:\n${toolContext}`] : []),
  ].join("\n");

async function generateAnswer(
  messages: ChatMessage[],
  toolContext: string,
  toolCalls: AgentToolResult[]
): Promise<string> {
  const transcript = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${m.content}`)
    .join("\n");

  const answer = await llmText({
    system: ANSWER_SYSTEM(toolContext),
    user: [
      ...(toolCalls.length > 0
        ? [`(Agent used tools; results are in the system context.)`]
        : []),
      `Conversation so far (last 10 turns):\n${transcript}`,
    ].join("\n"),
    maxTokens: 600,
  });

  return answer;
}