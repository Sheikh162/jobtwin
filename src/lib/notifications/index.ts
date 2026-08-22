import { registerProvider } from "@/lib/notifications/service";
import { TelegramProvider } from "@/lib/notifications/telegram";
import { NotificationChannelType } from "@/generated/prisma/enums";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) {
  registerProvider(NotificationChannelType.TELEGRAM, new TelegramProvider(token));
}

export { notifyUser } from "@/lib/notifications/service";
export type { NotificationMessage } from "@/lib/notifications/service";