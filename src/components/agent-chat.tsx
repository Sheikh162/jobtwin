"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, Bot, User, Wrench, CheckCircle2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; summary: string; changed?: boolean }[];
}

const STARTERS = [
  "What's in my queue?",
  "Show me my recent applications",
  "What are my search criteria?",
  "Check Vercel right now",
];

export function AgentChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm your sourcing twin. I watch companies' careers pages around the clock, vet the roles against your criteria, and ping you the instant something matches. Ask me what's in your queue, or tell me to check a company.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setError(null);

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent failed");
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.reply,
          toolCalls: (data.toolCalls ?? []).map((t: { tool: string; summary: string; changed?: boolean }) => ({
            tool: t.tool,
            summary: t.summary,
            changed: t.changed === true,
          })),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex max-h-[60vh] min-h-[40vh] flex-col gap-3 overflow-y-auto rounded-2xl border bg-secondary/20 p-3"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <Card className={`max-w-[85%] ${m.role === "user" ? "border-primary/30 bg-primary/5" : ""}`}>
              <CardContent className="space-y-2 pt-4">
                {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.toolCalls.map((t, j) => (
                      <span
                        key={j}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] ${
                          t.changed
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-background text-muted-foreground"
                        }`}
                      >
                        {t.changed ? <CheckCircle2 className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                        {t.summary}
                      </span>
                    ))}
                  </div>
                )}
                <p className="flex items-start gap-2 whitespace-pre-wrap text-sm leading-relaxed">
                  <span className="mt-0.5 shrink-0">
                    {m.role === "user" ? (
                      <User className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  {m.content}
                </p>
              </CardContent>
            </Card>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <Card>
              <CardContent className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Working…
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {messages.length < 2 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your agent…"
          className="h-10 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Message"
        />
        <Button type="submit" disabled={loading || !input.trim()} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-2 text-right text-[0.65rem] text-muted-foreground">You (user {userId.slice(0, 6)}…)</p>
    </div>
  );
}