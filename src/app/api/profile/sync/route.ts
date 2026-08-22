import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserFromToken } from "@/lib/extension-token";

export const runtime = "nodejs";

/**
 * Profile sync endpoint used by the browser extension.
 *
 * Auth: accepts EITHER a session cookie (browser) OR an `Authorization: Bearer
 * <token>` header (extension). The extension token flow lets autofill work
 * without the extension sharing the web session cookie.
 */
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
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

async function resolveUserId(request: NextRequest): Promise<string | null> {
  // 1) Bearer token (extension)
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    const resolved = await resolveUserFromToken(token);
    if (resolved) return resolved.userId;
    return null; // invalid token → reject, don't fall back
  }

  // 2) Session cookie (browser)
  const session = await auth();
  return session?.user?.id ?? null;
}