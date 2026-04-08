import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { ForecastService } from '@services/forecast';
import { inject, injectable } from '@needle-di/core';
import { LocationService } from '@services/location';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import { ButtonStyle, EmbedBuilder, ButtonBuilder, ActionRowBuilder, RESTJSONErrorCodes } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class ReportForecastsJob extends BaseJob {
	private readonly errorCodes = [
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.UnknownGuild,
		RESTJSONErrorCodes.UnknownMessage
	];

	public constructor(
		private readonly location = inject(LocationService),
		private readonly forecast = inject(ForecastService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: ReportForecastsJob.name,
			pattern: '0 * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableForecastReporting')) {
			return;
		}

		const destinations = await db.forecastDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				guildId: true,
				channelId: true,
				messageId: true,
				radarImageUrl: true,
			}
		});
		for (const { id, latitude, longitude, guildId, channelId, messageId, radarImageUrl } of destinations) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Forecast destination channel is missing or not a text channel, deleting record');

					await db.forecastDestination.delete({ where: { messageId } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Forecast destination message is not editable, deleting record');

					await db.forecastDestination.delete({ where: { messageId } });
					continue;
				}

				const location = await this.location.getInfoFromCoordinates(latitude, longitude);
				const forecast = await this.forecast.getForecastForCoordinates(latitude, longitude);
				if (!forecast) {
					continue;
				}

				const embed = new EmbedBuilder()
					.setTitle('⛅ ' + $msg.jobs.forecasts.embedTitle(forecast.name, location.location))
					.setColor(Color.Primary)
					.setThumbnail(forecast.getIcon('large'))
					.setDescription(forecast.detailedForecast)
					.addFields({ name: $msg.jobs.forecasts.atAGlanceTitle(), value: forecast.shortForecast })
					.setTimestamp();

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?v=${generateSnowflake()}`);
				}

				const deleteButton = new ButtonBuilder()
					.setCustomId(`delete-forecast:${messageId}`)
					.setLabel($msg.common.buttons.delete())
					.setStyle(ButtonStyle.Danger);
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton);

				await message.edit({ content: '', embeds: [embed], components: [row] });
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger
							.withMetadata({ guildId, channelId, messageId, code, message })
							.error('Could not fetch required resource(s), deleting corresponding record');

						await db.forecastDestination.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
