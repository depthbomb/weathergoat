import { db } from '@db';
import { _ } from '@lib/i18n';
import { logger } from '@lib/logger';
import { queueService } from '@services/queue';
import { isDiscordAPIError } from '@lib/errors';
import { time, EmbedBuilder } from 'discord.js';
import { featuresService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type Cron from 'croner';
import type { IJob } from '@jobs';
import type { Queue } from '@services/queue';
import type { WeatherGoat } from '@lib/client';
import type { Message, Awaitable } from 'discord.js';

type UpdateRadarMessagesQueue = (id: string, message: Message<true>, embed: EmbedBuilder) => Awaitable<unknown>;

interface IUpdateRadarMessagesJob extends IJob {
	[kQueue]: Queue<UpdateRadarMessagesQueue>;
	[kUpdateMessage](client: WeatherGoat<true>, job: Cron, id: string, guildId: string, channelId: string, messageId: string, location: string, radarStation: string, radarImageUrl: string): Promise<void>;
}

const kQueue         = Symbol('queue');
const kUpdateMessage = Symbol('update-message');

export const updateRadarMessagesJob: IUpdateRadarMessagesJob = ({
	name: 'com.weathergoat.jobs.UpdateRadarMessages',
	pattern: '*/5 * * * *',
	runImmediately: true,

	[kQueue]: queueService.createQueue('com.weathergoat.queues.RadarMessageUpdater', '1.5s'),
	async [kUpdateMessage](client, job, id, guildId, channelId, messageId, location, radarStation, radarImageUrl) {
		try {
			const guild   = await client.guilds.fetch(guildId);
			const channel = await guild.channels.fetch(channelId);

			if (!isTextChannel(channel)) {
				logger.warn('Radar channel is not a text channel, deleting record', { guildId, channelId, messageId, location });

				await db.radarChannel.delete({ where: { id } });
				return;
			}

			const message = await channel.messages.fetch(messageId);
			const embed = new EmbedBuilder()
					.setColor(client.brandColor)
					.setTitle(_('jobs.radar.embedTitle', { location }))
					.setFooter({ text: _('jobs.radar.embedFooter', { radarStation }) })
					.setImage(`${radarImageUrl}?${client.generateId(32)}`)
					.addFields(
						{ name: _('jobs.radar.lastUpdatedTitle'), value: time(new Date(), 'R'), inline: true },
						{ name: _('jobs.radar.nextUpdateTitle'), value: time(job.nextRun()!, 'R'), inline: true },
					);
			await message.edit({ embeds: [embed] })
		} catch (err: unknown) {
			if (isDiscordAPIError(err)) {
				const { code, message } = err;
				if ([10003, 10004, 10008].includes(code as number)) {
					// Unknown channel, guild, or message
					logger.error('Could not fetch required resource(s), deleting corresponding record', { guildId, channelId, messageId, location, code, message });

					await db.radarChannel.delete({ where: { id } });
				}
			} else {
				logger.error('An error occurred while updating a radar channel message', { err });
			}
		}
	},

	async execute(client, self) {
		if (featuresService.isFeatureEnabled('com.weathergoat.features.DisableRadarMessageUpdating', false)) return;

		const radarChannels = await db.radarChannel.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarChannels) {
			if (featuresService.isFeatureEnabled('com.weathergoat.features.UseRadarMessageUpdateQueue', false)) {
				this[kQueue].enqueue(async () => await this[kUpdateMessage](
					client, self,
					id, guildId, channelId, messageId, location, radarStation, radarImageUrl
				));
			} else {
				await this[kUpdateMessage](
					client, self,
					id, guildId, channelId, messageId, location, radarStation, radarImageUrl
				)
			}
		}
	}
});
