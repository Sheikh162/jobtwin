import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { agentTurn, type ChatMessage } from "@/lib/agent/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/chat — the agentic conversational endpoint.
 *
 * One engine, many twins: every request is scoped by the authenticated user's
 * session. The agent can call tools (queue summary, match details, criteria,
 * company crawls, applications) and answers about that user's data only.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }
  if (messages.length > 20) {
    return NextResponse.json({ error: "Too many messages (max 20)" }, { status: 400 });
  }

  try {
    const { reply, toolCalls } = await agentTurn(session.user.id, messages);
    return NextResponse.json({ reply, toolCalls });
  } catch (err) {
    console.error("[chat] agent turn failed:", err);
    return NextResponse.json({ error: "Agent failed. Try again." }, { status: 500 });
  }
}