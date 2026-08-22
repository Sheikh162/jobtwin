"use client";

import { Badge } from "@/components/ui/badge";
import { MapPin, Building2 } from "lucide-react";

interface Props {
  match: {
    id: string;
    score: number;
    listing: {
      title: string;
      location: string | null;
      source: string;
      company: { name: string; logoUrl: string | null; verificationStatus: string };
    };
  };
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function MatchRow({ match, selected, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect?.(match.id)}
      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
        selected ? "border-primary bg-secondary/50" : "border-transparent hover:bg-secondary/30"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-secondary/60">
          {match.listing.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.listing.company.logoUrl} alt={match.listing.company.name} className="h-6 w-6 rounded object-contain" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{match.listing.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {match.listing.company.name}
            <span className="mx-1.5 inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {match.listing.location ?? "Remote"}
            </span>
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 font-mono text-xs">
          {Math.round(match.score)}
        </Badge>
      </div>
    </button>
  );
}