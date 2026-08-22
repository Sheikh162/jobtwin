"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";

const SORT_OPTIONS = [
  { value: "fresh", label: "Newest first" },
  { value: "score", label: "Best match" },
  { value: "blended", label: "Blended" },
];

const WITHIN_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24h" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
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
      if (v === null || v === "") params.delete(k);
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

        <label className="text-xs text-muted-foreground">Sort</label>
        <select
          value={sort}
          onChange={(e) => apply({ sort: e.target.value === "fresh" ? null : e.target.value }, false)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
          <select
            value={companyId}
            onChange={(e) => apply({ company: e.target.value || null })}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Company"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            value={location}
            onChange={(e) => apply({ location: e.target.value || null })}
            placeholder="Location (e.g. Remote, London)"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Location"
          />

          <select
            value={minScore}
            onChange={(e) => apply({ minScore: e.target.value || null })}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Minimum score"
          >
            <option value="">Any score</option>
            <option value="10">Score 10+</option>
            <option value="20">Score 20+</option>
            <option value="30">Score 30+</option>
            <option value="40">Score 40+</option>
            <option value="50">Score 50+</option>
          </select>

          <select
            value={within}
            onChange={(e) => apply({ within: e.target.value || null })}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Matched within"
          >
            {WITHIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

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