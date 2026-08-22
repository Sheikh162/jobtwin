"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS = [
  { value: "fresh", label: "Newest first" },
  { value: "score", label: "Best match" },
  { value: "blended", label: "Blended" },
];

const WITHIN_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "1", label: "Last 24h" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
];

const SCORE_OPTIONS = [
  { value: "all", label: "Any score" },
  { value: "10", label: "Score 10+" },
  { value: "20", label: "Score 20+" },
  { value: "30", label: "Score 30+" },
  { value: "40", label: "Score 40+" },
  { value: "50", label: "Score 50+" },
];

export function QueueFilters({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  const companyId = sp.get("company") ?? "";
  const location = sp.get("location") ?? "";
  const remoteOnly = sp.get("remote") === "1";
  const minScore = sp.get("minScore") ?? "";
  const within = sp.get("within") ?? "";
  const sort = sp.get("sort") ?? "fresh";

  const activeCount = [companyId, location, remoteOnly, minScore, within].filter(Boolean).length;

  function apply(next: Record<string, string | null> = {}, toggleOpenAfter = false) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === "all") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page"); // reset pagination on filter change
    params.delete("selected"); // reset selection
    router.push(`/?${params.toString()}`);
    if (toggleOpenAfter) setOpen(false);
  }

  function clearAll() {
    router.push("/");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/40"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>

        <span className="text-xs text-muted-foreground">Sort</span>
        <Select value={sort} onValueChange={(v) => apply({ sort: v === "fresh" ? null : v })}>
          <SelectTrigger className="h-8 w-auto gap-1 rounded-md px-2 text-xs" aria-label="Sort">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-2 rounded-xl border bg-secondary/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select value={companyId || "all"} onValueChange={(v) => apply({ company: v === "all" ? null : v })}>
            <SelectTrigger className="h-9 w-full gap-1 rounded-md px-3 text-sm" aria-label="Company">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            value={location}
            onChange={(e) => apply({ location: e.target.value || null })}
            placeholder="Location (e.g. Remote, London)"
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Location"
          />

          <Select value={minScore || "all"} onValueChange={(v) => apply({ minScore: v === "all" ? null : v })}>
            <SelectTrigger className="h-9 w-full gap-1 rounded-md px-3 text-sm" aria-label="Minimum score">
              <SelectValue placeholder="Any score" />
            </SelectTrigger>
            <SelectContent>
              {SCORE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={within || "all"} onValueChange={(v) => apply({ within: v === "all" ? null : v })}>
            <SelectTrigger className="h-9 w-full gap-1 rounded-md px-3 text-sm" aria-label="Matched within">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              {WITHIN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => apply({ remote: e.target.checked ? "1" : null })}
              className="h-4 w-4 accent-foreground"
            />
            Remote only
          </label>
        </div>
      )}
    </div>
  );
}