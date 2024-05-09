import { db } from '@db';
import { Job } from '@jobs';
import { logger } from '@lib/logger';
import { time, EmbedBuilder } from 'discord.js';
import { isDiscordAPIError } from '@utils/errors';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@lib/client';
import { Duration } from '@sapphire/time-utilities';

export default class UpdateRadarMessagesJob extends Job {
	public constructor() {
		super({ name: 'job.update-radar-messages', pattern: '*/5 * * * *', runImmediately: true });
	}

	public async execute(client: WeatherGoat<true>) {
		const radarChannels = await db.radarChannel.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarChannels) {
			try {
				const guild   = await client.guilds.fetch(guildId);
				const channel = await guild.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				const embed = new EmbedBuilder()
						.setColor(client.brandColor)
						.setTitle(`Radar for ${location} (${radarStation})`)
						.setFooter({ text: 'This is the closest station for this location' })
						.setImage(`${radarImageUrl}?${client.generateId(16)}`)
						.addFields(
							{ name: 'Last Updated', value: time(new Date(), 'R'), inline: true },
							{ name: 'Next Update', value: time(new Duration('5m').fromNow, 'R'), inline: true },
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
}
