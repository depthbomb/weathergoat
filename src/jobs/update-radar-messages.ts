import { db } from '@db';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { msg } from '@lib/messages';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { time, EmbedBuilder, RESTJSONErrorCodes } from 'discord.js';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@lib/errors';
import type { Cron } from 'croner';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class UpdateRadarMessagesJob extends BaseJob {
	private readonly errorCodes = [
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.UnknownGuild,
		RESTJSONErrorCodes.UnknownMessage
	];

	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: 'update_radar_messages',
			pattern: '*/5 * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>, job: Cron) {
		if (this.features.isFeatureEnabled('disableRadarMessageUpdating')) {
			return;
		}

		const radarMessages = await db.autoRadarMessage.findMany();
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of radarMessages) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger
						.withMetadata({ guildId, channelId, messageId, location })
						.warn('Radar channel is not a text channel, deleting record');

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Auto radar message is not editable, deleting record');

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const embed = new EmbedBuilder()
					.setColor(Color.Primary)
					.setTitle(msg.$jobsRadarEmbedTitle(location))
					.setFooter({ text: msg.$jobsRadarEmbedFooter(radarStation) })
					.setImage(`${radarImageUrl}?${generateSnowflake()}`)
					.addFields(
						{ name: msg.$jobsRadarLastUpdatedTitle(), value: time(new Date(), 'R'), inline: true },
						{ name: msg.$jobsRadarNextUpdateTitle(), value: time(job.nextRun()!, 'R'), inline: true },
					);

				await message.edit({ content: msg.$deleteToDeleteSubheading(), embeds: [embed] });
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger
							.withMetadata({ guildId, channelId, messageId, location, code, message })
							.error('Could not fetch required resource(s), deleting corresponding record');

						await db.autoRadarMessage.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
