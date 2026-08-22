import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Inbox, Wrench } from "lucide-react";

export function EmptyQueue({ hasAnyDecision }: { hasAnyDecision: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>

      <div className="max-w-xs space-y-1.5">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {hasAnyDecision ? "Nothing pre-vetted right now" : "Your queue starts here"}
        </h2>
        <p className="text-sm text-muted-foreground">
          The sourcing agent watches companies&apos; career pages around the clock. When a matching
          listing appears, it lands here as a card — you just say yes or no.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!hasAnyDecision && (
          <Link href="/criteria">
            <Button className="gap-2">
              <Wrench className="h-4 w-4" />
              Set criteria
            </Button>
          </Link>
        )}
        <Link href="/community">
          <Button variant="outline" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Explore community
          </Button>
        </Link>
      </div>
    </div>
  );
}