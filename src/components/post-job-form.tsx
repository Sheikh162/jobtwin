"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJobListing } from "@/lib/actions";
import { Loader2, ShieldCheck, ShieldQuestion, ShieldAlert } from "lucide-react";
import Link from "next/link";

export function PostJobForm({
  companies,
  verificationStatus,
}: {
  companies: { id: string; name: string }[];
  verificationStatus: "DOMAIN_VERIFIED" | "PRESENCE_CONFIRMED" | "UNVERIFIED";
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await postJobListing({
        title,
        location: location || null,
        applyUrl: applyUrl || null,
        description: description || null,
        companyId: companyId || null,
        companyName: companyName || null,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setLoading(false);
    }
  }

  const trust = verificationMeta(verificationStatus);

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-tight">Post a job</CardTitle>
          <CardDescription>
            Your listing&apos;s provenance label is set server-side from a real check — you can&apos;t self-declare it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-secondary/20 px-4 py-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <trust.icon className="h-4 w-4" />
              Your posting trust level: {trust.label}
              {verificationStatus !== "DOMAIN_VERIFIED" && (
                <Badge variant="outline" className="rounded-md text-[0.6rem] font-normal normal-case">
                  {trust.chip}
                </Badge>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{trust.hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Job title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Staff Product Engineer"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote or city"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply">Apply URL</Label>
              <Input
                id="apply"
                type="url"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9 w-full gap-1 rounded-md px-3 text-sm" aria-label="Company">
                <SelectValue placeholder="New company…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">New company…</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!companyId && (
              <Input
                className="mt-2"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name (creates a new company)"
              />
            )}
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1 gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish listing"}
          </Button>
          <Button asChild variant="outline" disabled={verificationStatus === "DOMAIN_VERIFIED"}>
            <Link href="/profile">Verify work email</Link>
          </Button>
        </CardFooter>
      </Card>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}

function verificationMeta(status: "DOMAIN_VERIFIED" | "PRESENCE_CONFIRMED" | "UNVERIFIED") {
  if (status === "DOMAIN_VERIFIED") {
    return {
      icon: ShieldCheck,
      label: "Domain verified",
      chip: "domain-verified",
      hint: "Verified via work email — your postings carry the highest provenance label.",
    };
  }
  if (status === "PRESENCE_CONFIRMED") {
    return {
      icon: ShieldQuestion,
      label: "Presence confirmed",
      chip: "agent-confirmed",
      hint: "The agent confirmed the company is real. Verify a work email to post as a verified employee.",
    };
  }
  return {
    icon: ShieldAlert,
    label: "Unverified",
    chip: "unverified",
    hint: "Your listings will be clearly flagged as employer-submitted, unverified until you verify a work email.",
  };
}