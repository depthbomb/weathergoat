import { db } from '@db';
import { captureError } from '@lib/errors';
import { featuresService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { IJob } from '@jobs';
import type { WeatherGoat } from '@lib/client';

interface ISweepMessagesJob extends IJob {}

export const sweepMessagesJob: ISweepMessagesJob = ({
	name: 'com.weathergoat.jobs.SweepMessages',
	pattern: '* * * * *',
	runImmediately: true,

	async execute(client: WeatherGoat<true>) {
		if (featuresService.isFeatureEnabled('com.weathergoat.features.DisableMessageSweeping', false)) return;

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
});
