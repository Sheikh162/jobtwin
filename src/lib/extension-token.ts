import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const TOKEN_PREFIX = "jtx_";

/** Create a long-lived opaque token for the browser extension. Returns the raw token once. */
export async function createExtensionToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const secret = randomBytes(24).toString("hex");
  const token = `${TOKEN_PREFIX}${secret}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.extensionToken.create({
    data: { userId, token, expiresAt },
  });

  return { token, expiresAt };
}

/** Revoke a token by its raw value (or revoke all of a user's tokens). */
export async function revokeExtensionToken(userId: string, token?: string) {
  if (token) {
    await prisma.extensionToken.updateMany({
      where: { userId, token, revoked: false },
      data: { revoked: true },
    });
  } else {
    await prisma.extensionToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }
}

/** List a user's active tokens (without revealing secrets). */
export async function listExtensionTokens(userId: string) {
  return prisma.extensionToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });
}

/** Resolve a user from a Bearer token. Returns null when invalid/expired/revoked. */
export async function resolveUserFromToken(
  rawToken: string
): Promise<{ userId: string } | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;

  const row = await prisma.extensionToken.findUnique({
    where: { token: rawToken },
    select: { userId: true, revoked: true, expiresAt: true },
  });
  if (!row || row.revoked || row.expiresAt < new Date()) return null;

  // Bump last-used so active tokens are visible on the profile page.
  await prisma.extensionToken
    .update({ where: { token: rawToken }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.userId };
}