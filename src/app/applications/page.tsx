import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { ApplicationStatusRow } from "@/components/application-row";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default async function ApplicationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id },
    include: {
      listing: {
        include: {
          company: { select: { name: true, verificationStatus: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const stats = await prisma.transparencyStats.findMany({
    where: { companyId: { in: applications.map((a) => a.listing.companyId) } },
  });

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          applied → screened → interview → outcome. Every stage feeds the transparency stats below.
        </p>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No applications yet. Swipe right on a match and your application is sent from here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {applications.map((app) => (
            <ApplicationStatusRow key={app.id} application={app} />
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <BarChart3 className="h-4 w-4" />
            Transparency
          </h2>
          <div className="space-y-2.5">
            {stats.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <CardTitle className="font-display text-base tracking-tight">{s.role}</CardTitle>
                  <CardDescription className="text-xs">Live from {s.sampleSize} applicant(s)</CardDescription>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Response rate</p>
                      <p className="font-mono text-lg font-medium">
                        {s.responseRate != null ? `${s.responseRate.toFixed(0)}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg. time to response</p>
                      <p className="font-mono text-lg font-medium">
                        {s.avgTimeToResponse != null ? `${s.avgTimeToResponse.toFixed(0)}d` : "—"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Ghosting rate</p>
                      <p className="font-mono text-lg font-medium">
                        {s.ghostingRate != null ? `${s.ghostingRate.toFixed(0)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}