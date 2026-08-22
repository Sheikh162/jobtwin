"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { optInAsReferrer, offerReferral, sendReferral } from "@/lib/actions";
import { Loader2, ShieldCheck, Handshake, PenLine, Send, Check } from "lucide-react";

export function ReferralCenter({
  companies,
  verifiedCompanyIds,
  myReferrerProfiles,
  myReferrals,
  opportunities,
}: {
  companies: { id: string; name: string; verificationStatus: string }[];
  verifiedCompanyIds: string[];
  myReferrerProfiles: { companyId: string; active: boolean }[];
  myReferrals: { id: string; title: string; referrer: string; status: string; askDraft: string | null }[];
  opportunities: {
    matchId: string;
    listing: { id: string; title: string; company: string };
    referrer: { id: string; name: string };
    referral: { id: string | null; status: string; askDraft: string | null };
  }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"find" | "referrer">("find");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { id: string; askDraft: string }>>({});

  async function handleOffer(matchId: string, referrerId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await offerReferral(matchId, referrerId);
      setDrafts((d) => ({ ...d, [matchId]: { id: res.referralId, askDraft: res.askDraft } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to draft referral");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(referralId: string) {
    setLoading(true);
    setError(null);
    try {
      await sendReferral(referralId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send referral");
    } finally {
      setLoading(false);
    }
  }

  const verifiedCompanySet = new Set(verifiedCompanyIds);
  const myReferrerCompanyIds = new Set(
    myReferrerProfiles.filter((p) => p.active).map((p) => p.companyId)
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <TabButton active={tab === "find"} onClick={() => setTab("find")}>Find referrals</TabButton>
        <TabButton active={tab === "referrer"} onClick={() => setTab("referrer")}>Be a referrer</TabButton>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {tab === "find" && (
        <div className="space-y-3">
          {opportunities.length === 0 && (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              No referral opportunities yet. When a verified employee opts in at a company matching your queue, it shows here.
            </CardContent></Card>
          )}
          {opportunities.map((op) => (
            <Card key={op.matchId}>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{op.listing.title}</h3>
                    <p className="text-xs text-muted-foreground">{op.listing.company} · referrer {op.referrer.name}</p>
                  </div>
                  <Badge variant="outline" className="gap-1 rounded-md text-[0.6rem] font-normal"><ShieldCheck className="h-3 w-3" />Referrer</Badge>
                </div>

                {drafts[op.matchId] ? (
                  <div className="rounded-xl border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Agent-drafted ask — review and send:</p>
                    <p className="my-2 text-sm">{drafts[op.matchId].askDraft}</p>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-2" onClick={() => handleSend(drafts[op.matchId].id)} disabled={loading}>
                        <Send className="h-3.5 w-3.5" /> Approve & send
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[op.matchId]; return n; })}>
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOffer(op.matchId, op.referrer.id)} disabled={loading}>
                    <PenLine className="h-3.5 w-3.5" /> Draft the ask
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {myReferrals.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-base font-semibold tracking-tight">Your referral asks</h2>
              <div className="space-y-2">
                {myReferrals.map((r) => (
                  <Card key={r.id}><CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">to {r.referrer}</p>
                    </div>
                    <Badge variant={r.status === "SENT" ? "default" : "secondary"} className="rounded-md text-[0.6rem] font-normal">{r.status}</Badge>
                  </CardContent></Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "referrer" && (
        <ReferrerOptIn
          companies={companies}
          verifiedCompanyIds={[...verifiedCompanySet]}
          myReferrerCompanyIds={[...myReferrerCompanyIds]}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ReferrerOptIn({
  companies,
  verifiedCompanyIds,
  myReferrerCompanyIds,
}: {
  companies: { id: string; name: string; verificationStatus: string }[];
  verifiedCompanyIds: string[];
  myReferrerCompanyIds: string[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [teams, setTeams] = useState("");
  const [roles, setRoles] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const verifiedSet = new Set(verifiedCompanyIds);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      await optInAsReferrer({
        companyId,
        teams: teams.split(",").map((s) => s.trim()).filter(Boolean),
        roles: roles.split(",").map((s) => s.trim()).filter(Boolean),
        note: note || null,
      });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to opt in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
          <Handshake className="h-4 w-4" />
          Opt in as a referrer
        </CardTitle>
        <CardDescription>
          Only available once a company&apos;s work email is verified for you. Scope to teams/roles you know well.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="h-9 w-full gap-1 rounded-md px-3 text-sm" aria-label="Company">
            <SelectValue placeholder="Select a verified company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Select a verified company</SelectItem>
            {companies.filter((c) => verifiedSet.has(c.id)).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {myReferrerCompanyIds.includes(c.id) ? " (opted in)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {verifiedSet.size === 0 && (
          <p className="text-xs text-muted-foreground">Verify a work email on your profile to unlock referrer opt-in.</p>
        )}
        <Input value={teams} onChange={(e) => setTeams(e.target.value)} placeholder="Teams (comma-separated, optional)" />
        <Input value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="Roles (comma-separated, optional)" />
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything candidates should know, optional" rows={2} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={onSubmit} disabled={loading || !companyId} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Opt in
        </Button>
        {done && <p className="text-sm text-emerald-600">You&apos;re now a referrer for this company.</p>}
      </CardContent>
    </Card>
  );
}