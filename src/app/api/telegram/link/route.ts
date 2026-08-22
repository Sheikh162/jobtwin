import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NotificationChannelType } from "@/generated/prisma/enums";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * Creator a pairing token for the current user and return a deep link to the
 * bot. The webhook stores the real chatId once the user taps Start.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is not configured" },
      { status: 503 }
    );
  }

  const token = randomBytes(16).toString("hex");

  await prisma.notificationChannel.create({
    data: {
      userId: session.user.id,
      type: NotificationChannelType.TELEGRAM,
      externalId: `pair:${token}`,
      enabled: false,
    },
  });

  // Resolve bot username for the deep link.
  let username = "your-bot";
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
    if (data.ok && data.result?.username) username = data.result.username;
  } catch {} // Fall back to the placeholder; the token stays valid for pairing.

  const deepLink = `https://t.me/${username}?start=${token}`;

  return NextResponse.json({
    ok: true,
    deepLink,
    expiresIn: "24h",
  });
}