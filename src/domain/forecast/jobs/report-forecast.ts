import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { ForecastService } from '@services/forecast';
import { LocationService } from '@services/location';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { HourlyProgressTracker } from '../hourly-progress-tracker';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import { ButtonStyle, EmbedBuilder, ButtonBuilder, ActionRowBuilder, RESTJSONErrorCodes } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class ReportForecastsJob extends BaseJob {
	private readonly progress = new HourlyProgressTracker<number>();

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
			interval: '15s',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableForecastReporting')) {
			return;
		}

		if (!this.progress.begin(new Date())) {
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
			if (this.progress.hasCompleted(id)) {
				continue;
			}

			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Forecast destination channel is missing or not a text channel, deleting record');

					await db.forecastDestination.delete({ where: { messageId } });
					this.progress.markCompleted(id);
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Forecast destination message is not editable, deleting record');

					await db.forecastDestination.delete({ where: { messageId } });
					this.progress.markCompleted(id);
					continue;
				}

				const location = await this.location.getLocation(latitude, longitude);
				const forecast = await this.forecast.getForecastForCoordinates(latitude, longitude);
				if (!forecast) {
					continue;
				}

				const embed = new EmbedBuilder()
					.setTitle('⛅ ' + $msg.forecasts.job.embedTitle(forecast.name, location.name))
					.setColor(Color.Primary)
					.setThumbnail(forecast.getIcon('large'))
					.setDescription(forecast.detailedForecast)
					.addFields({ name: $msg.forecasts.job.atAGlanceTitle(), value: forecast.shortForecast })
					.setTimestamp();

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?v=${generateSnowflake()}`);
				}

				const deleteButton = new ButtonBuilder()
					.setCustomId(`delete-forecast:${messageId}`)
					.setLabel($msg.shared.buttons.delete())
					.setStyle(ButtonStyle.Danger);
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton);

				await message.edit({ content: '', embeds: [embed], components: [row] });
				this.progress.markCompleted(id);
			} catch (err) {
				if (isDiscordAPIError(err) && isDiscordAPIErrorCode(err, this.errorCodes)) {
					const { code, message } = err;
					this.logger
						.withMetadata({ guildId, channelId, messageId, code, message })
						.error('Could not fetch required resource(s), deleting corresponding record');

					await db.forecastDestination.delete({ where: { id } });
					this.progress.markCompleted(id);
				} else {
					reportError('Error reporting forecast destination', err, { id, guildId, channelId, messageId });
				}
			}
		}

		this.progress.finish(destinations.map(destination => destination.id));
	}
}
