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
			pattern: '* * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableRadarMessageUpdating')) {
			return;
		}

		const dueMessages = await db.autoRadarMessage.findMany({
			where: {
				nextUpdate: { lte: new Date() }
			},
			take: 500
		});
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl, nextUpdate } of dueMessages) {
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
						{ name: msg.$jobsRadarNextUpdateTitle(), value: time(nextUpdate, 'R'), inline: true },
					);

				await message.edit({ content: msg.$deleteToDeleteSubheading(), embeds: [embed] });
				await db.autoRadarMessage.update({
					data: {
						nextUpdate: new Date(Temporal.Now.instant().add({ minutes: 5 }).epochMilliseconds)
					},
					where: {
						id
					}
				});
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
