import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotificationChannelType } from "@/generated/prisma/enums";

export const runtime = "nodejs";

/**
 * Telegram bot webhook. Handles /start?payload=TOKEN to pair a chat with a
 * user account, and keeps the channel enabled for real-time pings.
 *
 * Register with:
 *   POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/telegram/webhook
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    message?: {
      chat?: { id: number; username?: string };
      text?: string;
      from?: { id?: number; username?: string };
    };
  };
  const msg = body.message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });

  const chatId = String(msg.chat.id);

  // /start token pairing
  const startMatch = /^\/start (?<token>\w+)/.exec(msg.text ?? "");
  if (startMatch?.groups?.token) {
    const token = startMatch.groups.token;
    const pair = await prisma.notificationChannel.findFirst({
      where: {
        type: NotificationChannelType.TELEGRAM,
        externalId: `pair:${token}`,
        enabled: false,
      },
    });
    if (pair) {
      await prisma.notificationChannel.update({
        where: { id: pair.id },
        data: {
          externalId: chatId,
          enabled: true,
          user: { update: { telegramName: msg.chat.username ?? null } },
        },
      });
      await reply(chatId, "You're paired with Jobtwin. You'll get real-time pings when the agent vets a matching role.");
    } else {
      await reply(chatId, "That link has expired. Re-open it from your profile.");
    }
    return NextResponse.json({ ok: true });
  }

  await reply(
    chatId,
    "Jobtwin bot: I'll ping you the moment a job matches your criteria. Link me from your profile to get started."
  );
  return NextResponse.json({ ok: true });
}

async function reply(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // A send failure must never break the webhook handshake with Telegram.
    console.error("[telegram] sendMessage failed:", (err as Error).message);
  }
}