"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Send, MessageSquare, Loader2 } from "lucide-react";

export function TelegramConnect({
  connected,
  telegramUsername,
}: {
  connected: boolean;
  telegramUsername?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link");
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
          <MessageSquare className="h-4 w-4" />
          Real-time alerts
          {connected ? (
            <Badge className="gap-1.5 bg-emerald-600/15 text-emerald-700">
              <Check className="h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Off</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Telegram pings you the instant the agent vets a matching role — no batched digests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected && telegramUsername ? (
          <p className="text-sm text-muted-foreground">
            Pings go to <span className="font-mono text-foreground">{telegramUsername}</span>.
          </p>
        ) : (
          <>
            <Button
              onClick={handleConnect}
              disabled={loading}
              className="w-full gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Link Telegram
            </Button>
            <p className="text-xs text-muted-foreground">
              A chat opens with the Jobtwin bot — tap Start to pair.
            </p>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}