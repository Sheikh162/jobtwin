"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ExternalLink, X, MapPin, BriefcaseBusiness, Building2 } from "lucide-react";
import { decideMatch } from "@/lib/actions";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { useRouter } from "next/navigation";

interface Props {
  match: {
    id: string;
    score: number;
    reasons: unknown;
    listing: {
      id: string;
      title: string;
      location: string | null;
      description: string | null;
      applyUrl: string | null;
      source: string;
      company: { name: string; logoUrl: string | null; verificationStatus: string };
    };
    criteria: { name: string } | null;
    transparency?: {
      responseRate: number | null;
      avgTimeToResponse: number | null;
      ghostingRate: number | null;
      sampleSize: number;
    } | null;
  };
}

export function MatchDetail({ match }: Props) {
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const router = useRouter();

  const reasons = (match.reasons ?? {}) as { reasons?: string[]; rationale?: string };

  async function swipe(choice: "approve" | "reject") {
    if (deciding) return;
    setDeciding(choice);
    try {
      await decideMatch(match.id, choice);
      setDecision(choice);
      await new Promise((r) => setTimeout(r, 350));
      router.refresh();
    } catch {
      setDeciding(null);
    }
  }

  return (
    <Card
      className={`overflow-hidden transition-opacity duration-300 ${
        decision ? "opacity-40" : "opacity-100"
      }`}
    >
      <CardContent className="space-y-3 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-secondary/60 text-[0.6rem] font-medium uppercase tracking-wide text-foreground">
              {match.listing.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={match.listing.company.logoUrl} alt={match.listing.company.name} className="h-9 w-9 rounded-md object-contain" />
              ) : (
                <Building2 className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{match.listing.company.name}</p>
              <h2 className="truncate font-display text-lg leading-tight tracking-tight">{match.listing.title}</h2>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            {Math.round(match.score)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {match.listing.location ?? "Remote / unspecified"}
          </span>
          {match.criteria && (
            <span className="inline-flex items-center gap-1.5">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              {match.criteria.name}
            </span>
          )}
        </div>

        <ProvenanceBadge source={match.listing.source} />

        {match.transparency && match.transparency.sampleSize > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {match.transparency.responseRate != null
                ? `${Math.round(match.transparency.responseRate)}% respond`
                : "Response unknown"}
              <span className="ml-1 font-normal text-muted-foreground">
                · {match.transparency.sampleSize} applicant{match.transparency.sampleSize > 1 ? "s" : ""}
              </span>
            </span>
            {match.transparency.avgTimeToResponse != null && (
              <span>~{match.transparency.avgTimeToResponse}d reply</span>
            )}
            {match.transparency.ghostingRate != null && (
              <span
                className={
                  match.transparency.ghostingRate > 50
                    ? "text-destructive"
                    : match.transparency.ghostingRate > 0
                      ? "text-amber-600"
                      : "text-emerald-600"
                }
              >
                {Math.round(match.transparency.ghostingRate)}% ghost
              </span>
            )}
          </div>
        )}

        {reasons.rationale && (
          <p className="border-l-2 border-primary/30 pl-3 text-sm text-foreground/90">{reasons.rationale}</p>
        )}
        {reasons.reasons && reasons.reasons.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {reasons.reasons.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-emerald-600" />
                {r}
              </li>
            ))}
          </ul>
        )}

        {match.listing.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{match.listing.description}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => swipe("reject")}
            disabled={!!deciding}
          >
            <X className="h-4 w-4" />
            Pass
          </Button>
          <Button
            variant="default"
            className="flex-1 gap-2"
            onClick={() => swipe("approve")}
            disabled={!!deciding}
          >
            <Check className="h-4 w-4" />
            Apply
          </Button>
          {match.listing.applyUrl && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open original posting"
              onClick={() => window.open(match.listing.applyUrl!, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}