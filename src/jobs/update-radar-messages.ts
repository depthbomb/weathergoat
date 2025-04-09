import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { Color } from '@constants';
import { generateSnowflake } from '@snowflake';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import { time, EmbedBuilder, RESTJSONErrorCodes } from 'discord.js';
import type { Cron } from 'croner';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';

export default class UpdateRadarMessagesJob extends BaseJob {
	private readonly logger: Logger;
	private readonly errorCodes: number[];

	public constructor() {
		super({
			name: 'update_radar_messages',
			pattern: '*/4 * * * *',
			runImmediately: true
		});

		this.logger     = logger.child({ jobName: this.name });
		this.errorCodes = [RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.UnknownGuild, RESTJSONErrorCodes.UnknownMessage];
	}

	public async execute(client: WeatherGoat<true>, job: Cron) {
		const radarMessages = await db.autoRadarMessage.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarMessages) {
			try {
				const guild   = await client.guilds.fetch(guildId);
				const channel = await guild.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger.warn('Radar channel is not a text channel, deleting record', { guildId, channelId, messageId, location });

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					logger.warn('Auto radar message is not editable, deleting record', { guildId, channelId, messageId });

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const embed = new EmbedBuilder()
					.setColor(Color.Primary)
					.setTitle(_('jobs.radar.embedTitle', { location }))
					.setFooter({ text: _('jobs.radar.embedFooter', { radarStation }) })
					.setImage(`${radarImageUrl}?${generateSnowflake()}`)
					.addFields(
						{ name: _('jobs.radar.lastUpdatedTitle'), value: time(new Date(), 'R'), inline: true },
						{ name: _('jobs.radar.nextUpdateTitle'), value: time(job.nextRun()!, 'R'), inline: true },
					);

				await message.edit({ content: _('common.deleteToDeleteSubheading'), embeds: [embed] });
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger.error('Could not fetch required resource(s), deleting corresponding record', { guildId, channelId, messageId, location, code, message });

						await db.autoRadarMessage.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
