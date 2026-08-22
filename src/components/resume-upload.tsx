"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";

interface ResumeProfile {
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  skills?: string[];
  githubUsername?: string | null;
}

export function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ResumeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setParsed(null);

    setLoading(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/resume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setParsed(data.profile);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg tracking-tight">Resume-parsed profile</CardTitle>
        <CardDescription>
          Upload your resume once — the agent builds your profile and never asks again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-secondary/40"
          htmlFor="resume"
        >
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">Choose a resume</span>
          <span className="text-xs text-muted-foreground">TXT, MD or PDF · up to 5MB</span>
          <input
            id="resume"
            type="file"
            accept=".txt,.md,.json,application/pdf"
            className="hidden"
            onChange={onFileChange}
            disabled={loading}
          />
        </label>

        {file && <p className="inline-flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />{file.name}</p>}

        {loading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Parsing with the agent…
          </p>
        )}

        {error && (
          <p className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {parsed && (
          <div className="space-y-3 rounded-xl border bg-secondary/30 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Profile parsed
            </p>
            {parsed.headline && (
              <p className="font-display text-base font-semibold tracking-tight">{parsed.headline}</p>
            )}
            {parsed.summary && <p className="text-sm text-muted-foreground">{parsed.summary}</p>}
            {parsed.skills && parsed.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parsed.skills.slice(0, 10).map((s) => (
                  <span
                    key={s}
                    className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {parsed.githubUsername && (
              <p className="text-xs text-muted-foreground">
                GitHub: <span className="font-mono">{parsed.githubUsername}</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}