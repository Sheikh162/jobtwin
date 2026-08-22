import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PostJobForm } from "@/components/post-job-form";
import { DomainVerificationStatus } from "@/generated/prisma/enums";

export default async function PostJobPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const [companies, verifications] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.domainVerification.findMany({
      where: { userId: session.user.id, status: DomainVerificationStatus.VERIFIED },
      select: { company: { select: { verificationStatus: true } } },
    }),
  ]);

  const anyVerified = verifications.length > 0;

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Post a job</h1>
        <p className="text-sm text-muted-foreground">
          Manual posting with tiered provenance — every listing shows where the info came from.
        </p>
      </div>
      <PostJobForm
        companies={companies}
        verificationStatus={anyVerified ? "DOMAIN_VERIFIED" : "UNVERIFIED"}
      />
    </AppShell>
  );
}