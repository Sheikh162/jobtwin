"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateApplicationStatus } from "@/lib/actions";
import { MapPin, Loader2 } from "lucide-react";

const ORDER_STAGE: Record<string, "SCREENED" | "INTERVIEW" | "OUTCOME" | undefined> = {
  APPLIED: "SCREENED",
  SCREENED: "INTERVIEW",
  INTERVIEW: "OUTCOME",
  OUTCOME: undefined,
};

const statusMeta: Record<string, { label: string; className: string; button: string }> = {
  APPLIED: { label: "Applied", className: "", button: "Mark screened" },
  SCREENED: { label: "Screened", className: "bg-primary/10 text-primary", button: "Mark interview" },
  INTERVIEW: { label: "Interview", className: "bg-amber-600/10 text-amber-700", button: "Mark outcome" },
  OUTCOME: { label: "Outcome", className: "bg-emerald-600/10 text-emerald-700", button: "" },
};

export function ApplicationStatusRow({
  application,
}: {
  application: {
    id: string;
    status: string;
    listing: {
      title: string;
      location: string | null;
      company: { name: string; verificationStatus: string };
    };
  };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const meta = statusMeta[application.status] ?? statusMeta.APPLIED;
  const next = ORDER_STAGE[application.status];

  async function advance() {
    if (!next) return;
    setLoading(true);
    try {
      await updateApplicationStatus(application.id, next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium">{application.listing.title}</h3>
            <Badge variant="outline" className={`rounded-md text-[0.65rem] font-normal normal-case ${meta.className}`}>
              {meta.label}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {application.listing.company.name}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {application.listing.location ?? "Remote"}
            </span>
          </p>
        </div>
        {next ? (
          <Button variant="outline" size="sm" onClick={advance} disabled={loading} className="shrink-0 gap-1.5">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {meta.button}
          </Button>
        ) : (
          <Badge variant="secondary">Done</Badge>
        )}
      </CardContent>
    </Card>
  );
}