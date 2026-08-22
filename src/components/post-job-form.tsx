"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { postJobListing } from "@/lib/actions";
import { Loader2, ShieldCheck, ShieldQuestion } from "lucide-react";

const provenanceOptions = [
  {
    value: "EMPLOYEE_POSTED",
    label: "Posted by verified employee",
    chip: "domain-verified",
    icon: ShieldCheck,
    hint: "Highest trust — identity confirmed via work email.",
  },
  {
    value: "EMPLOYER_SUBMITTED_VERIFIED",
    label: "Employer-submitted · presence confirmed",
    chip: "agent-confirmed",
    icon: ShieldQuestion,
    hint: "Self-reported, but the agent corroborated the company is real.",
  },
  {
    value: "EMPLOYER_SUBMITTED_UNVERIFIED",
    label: "Employer-submitted · unverified",
    chip: "unverified",
    icon: ShieldQuestion,
    hint: "Lowest tier — clearly flagged on the listing.",
  },
] as const;

type Provenance = (typeof provenanceOptions)[number]["value"];

export function PostJobForm({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [provenance, setProvenance] = useState<Provenance>("EMPLOYER_SUBMITTED_VERIFIED");
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
        source: provenance,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-tight">Post a job</CardTitle>
          <CardDescription>
            Every listing carries its provenance label — trust is earned, not assumed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              aria-label="Company"
            >
              <option value="">New company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!companyId && (
              <Input
                className="mt-2"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name (creates a new company)"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Provenance label</Label>
            <div className="space-y-2">
              {provenanceOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    provenance === opt.value ? "border-primary bg-secondary/40" : "hover:bg-secondary/25"
                  }`}
                >
                  <input
                    type="radio"
                    name="provenance"
                    value={opt.value}
                    checked={provenance === opt.value}
                    onChange={() => setProvenance(opt.value)}
                    className="mt-1 h-4 w-4 accent-foreground"
                  />
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <opt.icon className="h-4 w-4 text-muted-foreground" />
                      {opt.label}
                      <Badge variant="outline" className="rounded-md text-[0.6rem] font-normal normal-case">
                        {opt.chip}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish listing"}
          </Button>
        </CardFooter>
      </Card>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}