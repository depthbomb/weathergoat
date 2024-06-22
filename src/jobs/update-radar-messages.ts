import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { Colors } from '@constants';
import { v7 as uuidv7 } from 'uuid';
import { isDiscordAPIError } from '@errors';
import { time, EmbedBuilder } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type Cron from 'croner';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';

export default class UpdateRadarMessagesJob extends BaseJob {
	private readonly _logger: Logger;

	public constructor() {
		super({
			name: 'update_radar_messages',
			pattern: '*/2 * * * *',
			runImmediately: true
		});

		this._logger = logger.child({ name: this.name });
	}

	public async execute(client: WeatherGoat<true>, job: Cron) {
		const radarChannels = await db.radarChannel.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarChannels) {
			try {
				const guild = await client.guilds.fetch(guildId);
				const channel = await guild.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this._logger.warn('Radar channel is not a text channel, deleting record', { guildId, channelId, messageId, location });

					await db.radarChannel.delete({ where: { id } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				const embed = new EmbedBuilder()
						.setColor(Colors.Primary)
						.setTitle(_('jobs.radar.embedTitle', { location }))
						.setFooter({ text: _('jobs.radar.embedFooter', { radarStation }) })
						.setImage(`${radarImageUrl}?${uuidv7()}`)
						.addFields(
							{ name: _('jobs.radar.lastUpdatedTitle'), value: time(new Date(), 'R'), inline: true },
							{ name: _('jobs.radar.nextUpdateTitle'), value: time(job.nextRun()!, 'R'), inline: true },
						);
				await message.edit({ embeds: [embed] })
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if ([10003, 10004, 10008].includes(code as number)) {
						// Unknown channel, guild, or message
						this._logger.error('Could not fetch required resource(s), deleting corresponding record', { guildId, channelId, messageId, location, code, message });

						await db.radarChannel.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
