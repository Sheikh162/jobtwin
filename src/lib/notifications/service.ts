import { prisma } from "@/lib/prisma";
import { NotificationChannelType } from "@/generated/prisma/enums";

export interface NotificationMessage {
  title: string;
  body: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable notification service. Channels can be added by registering a new
 * impl here; the rest of the system only talks to `notifyUser`.
 */
export interface NotificationProvider {
  send(channel: { externalId: string }, message: NotificationMessage): Promise<void>;
}

const providers = new Map<NotificationChannelType, NotificationProvider>();

export function registerProvider(type: NotificationChannelType, provider: NotificationProvider) {
  providers.set(type, provider);
}

export async function notifyUser(userId: string, message: NotificationMessage) {
  const channels = await prisma.notificationChannel.findMany({
    where: { userId, enabled: true },
  });
  for (const channel of channels) {
    const provider = providers.get(channel.type);
    if (!provider) continue;
    try {
      await provider.send(channel, message);
    } catch (err) {
      console.error(`[notify] failed on ${channel.type}:`, err);
    }
  }
}