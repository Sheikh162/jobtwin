"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { connectExtension, disconnectExtension } from "@/lib/actions";
import { Loader2, Puzzle, Copy, Check, Trash2 } from "lucide-react";

export function ExtensionConnect({ activeTokens }: { activeTokens: number }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    setToken(null);
    try {
      const res = await connectExtension();
      setToken(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      await disconnectExtension();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
          <Puzzle className="h-4 w-4" />
          Autofill extension
          {activeTokens > 0 && (
            <Badge variant="secondary" className="rounded-md text-[0.6rem] font-normal">
              {activeTokens} active token{activeTokens > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Connect the browser extension so it can autofill your profile on Greenhouse/Lever applications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!token && (
          <p className="text-sm text-muted-foreground">
            Link the Jobtwin extension to your account. You&apos;ll get a personal token to paste into the
            extension&apos;s settings — it stays valid for a year and can be revoked anytime.
          </p>
        )}

        {token && (
          <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
            <p className="mb-2 text-muted-foreground">
              Copy this token into the extension popup&apos;s API token field. <strong>Show it only once</strong> —
              we store it hashed-side and won&apos;t reveal it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{token}</code>
              <Button variant="ghost" size="icon" onClick={copyToken} aria-label="Copy token">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="gap-2">
        {!token && (
          <Button onClick={handleConnect} disabled={loading} className="flex-1 gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Puzzle className="h-4 w-4" />}
            Generate extension token
          </Button>
        )}
        {activeTokens > 0 && !token && (
          <Button variant="outline" onClick={handleDisconnect} disabled={loading} className="gap-2">
            <Trash2 className="h-4 w-4" /> Revoke all
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}