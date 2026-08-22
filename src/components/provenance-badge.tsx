import { Badge } from "@/components/ui/badge";

const LABELS: Record<
  string,
  { text: string; tone: "green" | "blue" | "amber" | "muted" }
> = {
  SOURCED: { text: "Sourced from careers page", tone: "green" },
  EMPLOYEE_POSTED: { text: "Posted by verified employee", tone: "blue" },
  EMPLOYER_SUBMITTED_VERIFIED: { text: "Presence confirmed by agent", tone: "amber" },
  EMPLOYER_SUBMITTED_UNVERIFIED: { text: "Employer-submitted · unverified", tone: "muted" },
};

const toneClass: Record<string, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  muted: "",
};

export function ProvenanceBadge({ source }: { source: string }) {
  const meta = LABELS[source] ?? { text: source, tone: "muted" };
  return (
    <Badge
      variant="outline"
      className={`rounded-md text-[0.65rem] font-normal normal-case ${toneClass[meta.tone]}`}
    >
      {meta.text}
    </Badge>
  );
}