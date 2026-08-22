"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPost } from "@/lib/actions";
import { Send, Loader2, ShieldCheck } from "lucide-react";

export function PostComposer({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 5) return;
    setLoading(true);
    setError(null);
    try {
      await createPost({ body, companyId: companyId || null, role: role || null });
      setBody("");
      setRole("");
      setCompanyId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Posts are pseudonymous by default.
          </p>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ask about the interview loop, culture, a team, anything…"
            rows={3}
            maxLength={4000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9 w-auto gap-1 rounded-md px-3 text-sm" aria-label="Company">
                <SelectValue placeholder="Any company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any company</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role, e.g. frontend engineer"
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-w-32"
            />
            <Button type="submit" disabled={loading || body.trim().length < 5} className="ml-auto gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}