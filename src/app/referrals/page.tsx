import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { ReferralCenter } from "@/components/referral-center";
import { getReferralOpportunities } from "@/lib/actions";
import { DomainVerificationStatus } from "@/generated/prisma/enums";

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const [companies, userVerifications, myReferrerProfiles, myReferralRows, opportunities] =
    await Promise.all([
      prisma.company.findMany({ select: { id: true, name: true, verificationStatus: true }, orderBy: { name: "asc" } }),
      prisma.domainVerification.findMany({
        where: { userId: session.user.id, status: DomainVerificationStatus.VERIFIED },
        select: { companyId: true },
      }),
      prisma.referrerProfile.findMany({
        where: { userId: session.user.id },
        select: { companyId: true, active: true },
      }),
      prisma.referral.findMany({
        where: { candidateId: session.user.id },
        include: { listing: { select: { title: true } }, referrer: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      getReferralOpportunities(),
    ]);

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Verified employees opt in as referrers; the agent drafts the ask; you approve and it&apos;s sent.
        </p>
      </div>
      <ReferralCenter
        companies={companies}
        verifiedCompanyIds={userVerifications.map((v) => v.companyId)}
        myReferrerProfiles={myReferrerProfiles}
        myReferrals={myReferralRows.map((r) => ({
          id: r.id,
          title: r.listing.title,
          referrer: r.referrer.name ?? "someone",
          status: r.status,
          askDraft: r.askDraft,
        }))}
        opportunities={opportunities.map((o) => ({
          matchId: o.matchId,
          listing: { id: o.listing.id, title: o.listing.title, company: o.listing.company },
          referrer: { id: o.referrer.id, name: o.referrer.name },
          referral: { id: o.referral.id, status: o.referral.status, askDraft: o.referral.askDraft },
        }))}
      />
    </AppShell>
  );
}