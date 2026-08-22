"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { saveCriteria } from "@/lib/actions";
import { X, Plus, Loader2, Sparkles } from "lucide-react";

export function CriteriaForm({
  initial,
}: {
  initial: {
    name: string;
    keywords: string[];
    locations: string[];
    remoteOnly: boolean;
    minSalary: number | null;
  } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "My criteria");
  const [keyword, setKeyword] = useState("");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<string[]>(initial?.locations ?? []);
  const [remoteOnly, setRemoteOnly] = useState(initial?.remoteOnly ?? false);
  const [minSalary, setMinSalary] = useState(initial?.minSalary?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addKeyword() {
    const k = keyword.trim();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKeyword("");
  }
  function addLocation() {
    const l = location.trim();
    if (l && !locations.includes(l)) setLocations([...locations, l]);
    setLocation("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Register anything still sitting in the inputs (typing + Save directly
      // used to silently drop it — the cause of "India not saved").
      const finalKeywords = keyword.trim() && !keywords.includes(keyword.trim())
        ? [...keywords, keyword.trim()]
        : keywords;
      const finalLocations = location.trim() && !locations.includes(location.trim())
        ? [...locations, location.trim()]
        : locations;

      await saveCriteria({
        name,
        keywords: finalKeywords,
        locations: finalLocations,
        remoteOnly,
        minSalary: minSalary ? Number(minSalary) : null,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
            <Sparkles className="h-4 w-4" />
            What should the agent hunt for?
          </CardTitle>
          <CardDescription>
            The agent checks every fresh listing against this and only surfaces what clears the bar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Keywords</Label>
            <div className="flex gap-2">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder="e.g. backend, typescript"
              />
              <Button type="button" variant="outline" onClick={addKeyword} aria-label="Add keyword">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {keywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/40 px-2.5 py-1 text-xs">
                    {k}
                    <button type="button" onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Locations</Label>
            <div className="flex gap-2">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLocation())}
                placeholder="e.g. San Francisco"
              />
              <Button type="button" variant="outline" onClick={addLocation} aria-label="Add location">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {locations.length > 0 && locations.includes("Remote") === false && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {locations.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/40 px-2.5 py-1 text-xs">
                    {l}
                    <button type="button" onClick={() => setLocations(locations.filter((x) => x !== l))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl border px-4 py-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Remote only</span>
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salary">Minimum salary (USD/year, optional)</Label>
            <Input
              id="salary"
              type="number"
              placeholder="120000"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1 gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save criteria
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/")}>Cancel</Button>
        </CardFooter>
      </Card>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}