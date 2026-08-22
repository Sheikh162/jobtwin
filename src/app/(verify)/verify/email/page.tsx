import Link from "next/link";
import { confirmVerification } from "@/lib/verification";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await confirmVerification(token) : { ok: false as const, error: "Missing verification token." };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {result.ok ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <h1 className="font-display text-2xl font-semibold tracking-tight">Email verified</h1>
              <p className="text-sm text-muted-foreground">
                Your work email confirms you belong to this company. You can now post as a verified employee and
                your community posts carry the domain-verified tier.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h1 className="font-display text-2xl font-semibold tracking-tight">Verification failed</h1>
              <p className="text-sm text-muted-foreground">{result.error}</p>
            </>
          )}
          <Button asChild className="mt-2">
            <Link href="/profile">Back to profile</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}