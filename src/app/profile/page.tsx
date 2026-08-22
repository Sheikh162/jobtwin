import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { ResumeUpload } from "@/components/resume-upload";
import { TelegramConnect } from "@/components/telegram-connect";
import { VerifyEmail } from "@/components/verify-email";
import { ExtensionConnect } from "@/components/extension-connect";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GithubIcon } from "@/components/github-icon";
import { Check, X, Mail } from "lucide-react";
import { DomainVerificationStatus } from "@/generated/prisma/enums";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/welcome");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      accounts: true,
      channels: true,
    },
  });

  if (!user) redirect("/welcome");

  const githubAccount = user.accounts.find((a) => a.provider === "github");
  const telegram = user.channels.find((c) => c.type === "TELEGRAM");

  const [companies, verifications, extensionTokens] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true, verificationStatus: true }, orderBy: { name: "asc" } }),
    prisma.domainVerification.findMany({
      where: { userId: user.id, status: DomainVerificationStatus.VERIFIED },
      select: { companyId: true },
    }),
    prisma.extensionToken.count({
      where: { userId: user.id, revoked: false, expiresAt: { gt: new Date() } },
    }),
  ]);

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">The data your agent works from.</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg tracking-tight">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {(user.name ?? "JT").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{user.name ?? "Unnamed"}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" /> {user.email ?? "no email"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">Signed in</Badge>
            </div>

            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <div className="flex items-center gap-3">
                <GithubIcon className="h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">GitHub</p>
                  <p className="text-xs text-muted-foreground">
                    {user.githubUsername ?? githubAccount?.providerAccountId ?? "Not connected"}
                  </p>
                </div>
              </div>
              {user.githubUsername ? (
                <Badge className="gap-1.5 bg-emerald-600/15 text-emerald-700">
                  <Check className="h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                  <X className="h-3 w-3" /> Not connected
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <ResumeUpload />

        <TelegramConnect
          connected={!!telegram}
          telegramUsername={telegram?.externalId ?? undefined}
        />

        <VerifyEmail
          companies={companies}
          verifiedCompanyIds={verifications.map((v) => v.companyId)}
        />

        <ExtensionConnect activeTokens={extensionTokens} />

        {user.resumeParsed && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg tracking-tight">Parsed profile</CardTitle>
              <CardDescription>Raw structured output from {user.resumeFileName ?? "your resume"}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-64 overflow-auto rounded-lg bg-secondary/40 p-3 font-mono text-xs">
                {JSON.stringify(user.resumeParsed, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}