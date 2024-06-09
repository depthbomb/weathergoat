import { db } from '@db';
import { _ } from '@lib/i18n';
import { logger } from '@lib/logger';
import { isDiscordAPIError } from '@lib/errors';
import { time, EmbedBuilder } from 'discord.js';
import { featuresService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { IJob } from '@jobs';

interface IUpdateRadarMessagesJob extends IJob {}

export const updateRadarMessagesJob: IUpdateRadarMessagesJob = ({
	name: 'com.jobs.update-radar-messages',
	pattern: '*/5 * * * *',
	runImmediately: true,

	async execute(client, self) {
		if (featuresService.isFeatureEnabled('com.jobs.update-radar-messages.Disable', false)) return;

		const radarChannels = await db.radarChannel.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarChannels) {
			try {
				const guild   = await client.guilds.fetch(guildId);
				const channel = await guild.channels.fetch(channelId);

				if (!isTextChannel(channel)) continue;

				const message = await channel.messages.fetch(messageId);
				const embed = new EmbedBuilder()
						.setColor(client.brandColor)
						.setTitle(_('jobs.radar.embedTitle', { location }))
						.setFooter({ text: _('jobs.radar.embedFooter', { radarStation }) })
						.setImage(`${radarImageUrl}?${client.generateId(32)}`)
						.addFields(
							{ name: _('jobs.radar.lastUpdatedTitle'), value: time(new Date(), 'R'), inline: true },
							{ name: _('jobs.radar.nextUpdateTitle'), value: time(self.nextRun()!, 'R'), inline: true },
						)

				await message.edit({ embeds: [embed] });
			} catch (err: unknown) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if ([10003, 10004, 10008].includes(code as number)) {
						// Unknown channel, guild, or message
						logger.error('Could not fetch required resource(s), deleting corresponding record', { id, code, message });

						await db.radarChannel.delete({ where: { id } });
					}
				} else {
					logger.error('An error occurred while updating a radar channel message', { err });
				}
			}
		}
	}
});
