"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, MailCheck, Loader2, Copy, Check } from "lucide-react";

export function VerifyEmail({
  companies,
  verifiedCompanyIds,
}: {
  companies: { id: string; name: string; verificationStatus: string }[];
  verifiedCompanyIds: string[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !email) {
      setError("Pick a company and enter your work email.");
      return;
    }
    setLoading(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch("/api/verify/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start verification");
      setLink(data.verificationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start verification");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
          <ShieldCheck className="h-4 w-4" />
          Verify a work email
          {verifiedCompanyIds.length > 0 && (
            <Badge className="bg-emerald-600/15 text-emerald-700">{verifiedCompanyIds.length} verified</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Verify a company mailbox to post as a verified employee and earn the domain-verified tier. Work email
          only — it must match the company&apos;s domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Company"
          >
            <option value="">Select company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {verifiedCompanyIds.includes(c.id) ? " ✓" : ""}
              </option>
            ))}
          </select>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            aria-label="Work email"
          />
        </div>

        <Button onClick={onSubmit} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          Send verification link
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {link && (
          <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
            <p className="mb-2 text-muted-foreground">
              Demo mode (no email provider): open this link from your work inbox to confirm. Copy it to send
              yourself.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
              <Button variant="ghost" size="icon" onClick={copyLink} aria-label="Copy link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              asChild
              variant="link"
              className="mt-1 h-auto p-0 text-xs"
              onClick={() => router.refresh()}
            >
              <span>Open link to verify</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}