import { db } from '@db';
import { Job } from '@jobs';
import { eq, and } from 'drizzle-orm';
import { ChannelType } from 'discord.js';
import { captureError } from '@lib/errors';
import { volatileMessages } from '@db/schemas';
import type { WeatherGoat } from '@lib/client';

export default class MessageCleanupJob extends Job {
	public constructor() {
		super({ name: 'job.message-cleanup', pattern: '* * * * *', runImmediately: true });
	}

	public async execute(client: WeatherGoat<true>) {
		const messages = await db.query.volatileMessages.findMany({ where: (m, { lte }) => lte(m.expiresAt, new Date()) });
		for (const { channelId, messageId } of messages) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (channel && channel.type === ChannelType.GuildText) {
					const message = await channel.messages.fetch(messageId);
					if (message) {
						await message.delete();
					}
				}
			} catch (err) {
				captureError('Error while deleting volatile message', err, { channelId, messageId });
			} finally {
				await db.delete(volatileMessages).where(
					and(
						eq(volatileMessages.channelId, channelId),
						eq(volatileMessages.messageId, messageId)
					)
				);
			}
		}
	}
}
