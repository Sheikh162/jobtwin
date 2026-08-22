import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { startDomainVerification } from "@/lib/verification";

export const runtime = "nodejs";

/**
 * Start a domain-email verification. For the MVP (no email provider) this
 * returns the one-time verification URL so it can be delivered via the lower-
 * fidelity channel the demo supports; the URL only works from a mailbox at the
 * claimed company domain.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { companyId?: string; email?: string };
  if (!body.companyId || !body.email) {
    return NextResponse.json({ error: "companyId and email are required" }, { status: 400 });
  }

  const result = await startDomainVerification({
    userId: session.user.id,
    companyId: body.companyId,
    email: body.email,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    verificationUrl: result.verificationUrl,
    expiresAt: result.expiresAt,
  });
}