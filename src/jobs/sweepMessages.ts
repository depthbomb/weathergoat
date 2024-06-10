import { db } from '@db';
import { captureError } from '@lib/errors';
import { queueService } from '@services/queue';
import { featuresService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { IJob } from '@jobs';
import type { Queue } from '@services/queue';
import type { WeatherGoat } from '@lib/client';
import type { Message, Awaitable } from 'discord.js';

type SweepMessagesQueue = (message: Message<true>) => Awaitable<unknown>;

interface ISweepMessagesJob extends IJob {
	[kQueue]: Queue<SweepMessagesQueue>;
}

const kQueue = Symbol('queue');

export const sweepMessagesJob: ISweepMessagesJob = ({
	name: 'com.jobs.sweep-messages',
	pattern: '* * * * *',
	runImmediately: true,

	[kQueue]: queueService.createQueue('com.queues.sweep-messages', async (message) => await message.delete(), '1s'),

	async execute(client: WeatherGoat<true>) {
		if (featuresService.isFeatureEnabled('com.jobs.sweep-messages.Disabled', false)) return;

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
						if (featuresService.isFeatureEnabled('com.jobs.sweep-messages.UseQueue', false)) {
							this[kQueue].add(message);
						} else {
							await message.delete();
						}
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
