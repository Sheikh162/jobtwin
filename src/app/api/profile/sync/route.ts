import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Profile sync endpoint used by the browser extension. Returns the parsed
 * resume profile in the flat shape the autofill content script expects.
 *
 * Auth note: for the MVP the extension uses the session cookie; a token-gated
 * variant can be added without changing the extension contract.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = (user.resumeParsed ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    ok: true,
    profile: {
      fullName: p.fullName ?? user.name,
      email: user.email,
      headline: p.headline ?? null,
      githubUsername: user.githubUsername ?? p.githubUsername ?? null,
      githubUrl: user.githubUsername ? `https://github.com/${user.githubUsername}` : null,
      skills: p.skills ?? [],
      raw: user.resumeParsed,
    },
  });
}