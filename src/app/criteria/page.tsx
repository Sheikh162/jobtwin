import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { CriteriaForm } from "@/components/criteria-form";

export default async function CriteriaPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const existing = await prisma.searchCriteria.findFirst({
    where: { userId: session.user.id },
  });

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Search criteria</h1>
        <p className="text-sm text-muted-foreground">
          The agent matches every fresh listing against this.
        </p>
      </div>
      <CriteriaForm
        initial={
          existing
            ? {
                name: existing.name,
                keywords: existing.keywords,
                locations: existing.locations,
                remoteOnly: existing.remoteOnly,
                minSalary: existing.minSalary,
              }
            : null
        }
      />
    </AppShell>
  );
}