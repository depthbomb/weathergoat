import { db } from '@db';
import { BaseJob } from '@jobs';
import { captureError } from '@lib/errors';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@lib/client';

export default class SweepMessagesJob extends BaseJob {
	public constructor() {
		super({
			name: 'com.weathergoat.jobs.SweepMessages',
			pattern: '* * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		const messages = await db.volatileMessage.findMany({
			select: {
				id: true,
				channelId: true,
				messageId: true
			},
			where: {
				expiresAt: { lte: new Date() }
			}
		});
		for (const { id, channelId, messageId } of messages) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (isTextChannel(channel)) {
					const message = await channel.messages.fetch(messageId);
					if (message) {
						await message.delete();
					}
				}
			} catch (err) {
				captureError('Error while deleting volatile message', err, { channelId, messageId });
			} finally {
				await db.volatileMessage.delete({ where: { id } });
			}
		}
	}
}
