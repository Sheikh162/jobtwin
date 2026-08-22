import type {
  NotificationProvider,
  NotificationMessage,
} from "@/lib/notifications/service";

interface TelegramSendParams {
  chat_id: string;
  text: string;
  parse_mode?: "HTML" | "MarkdownV2";
  link_preview_options?: { is_disabled: boolean };
}

/**
 * Telegram notification provider. Uses the pure HTTP Bot API — no SDK needed,
 * works serverless and in the worker alike.
 */
export class TelegramProvider implements NotificationProvider {
  constructor(private readonly token: string) {}

  private base() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async send(
    channel: { externalId: string },
    message: NotificationMessage
  ): Promise<void> {
    const text = message.url
      ? `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}\n\n<a href="${message.url}">Open →</a>`
      : `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}`;

    const payload: TelegramSendParams = {
      chat_id: channel.externalId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    };

    const res = await fetch(`${this.base()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage ${res.status}: ${body}`);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}