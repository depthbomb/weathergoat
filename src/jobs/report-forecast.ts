import { db } from '@db';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { msg } from '@lib/messages';
import { logger } from '@lib/logger';
import { generateSnowflake } from '@lib/snowflake';
import { LocationService } from '@services/location';
import { ForecastService } from '@services/forecast';
import { inject, injectable } from '@needle-di/core';
import { EmbedBuilder, RESTJSONErrorCodes } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@lib/errors';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class ReportForecastsJob extends BaseJob {
	private readonly logger: Logger;
	private readonly errorCodes: number[];

	public constructor(
		private readonly location = inject(LocationService),
		private readonly forecast = inject(ForecastService),
	) {
		super({
			name: 'report_forecasts',
			pattern: '0 * * * *',
			runImmediately: true
		});

		this.logger     = logger.child({ jobName: this.name });
		this.errorCodes = [RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.UnknownGuild, RESTJSONErrorCodes.UnknownMessage];
	}

	public async execute(client: WeatherGoat<true>) {
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
				const guild   = await client.guilds.fetch(guildId);
				const channel = await guild?.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					logger.warn('Forecast destination channel is missing or not a text channel, deleting record', { guildId, channelId, messageId });

					await db.forecastDestination.delete({ where: { messageId } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					logger.warn('Forecast destination message is not editable, deleting record', { guildId, channelId, messageId });

					await db.forecastDestination.delete({ where: { messageId } });
					continue;
				}

				const forecast = await this.forecast.getForecastForCoordinates(latitude, longitude);
				const location = await this.location.getInfoFromCoordinates(latitude, longitude);
				const embed = new EmbedBuilder()
					.setTitle('⛅ ' + msg.$jobsForecastsEmbedTitle(forecast.name, location.location))
					.setColor(Color.Primary)
					.setThumbnail(forecast.getIcon('large'))
					.setDescription(forecast.detailedForecast)
					.addFields({ name: msg.$jobsForecastsAtAGlanceTitle(), value: forecast.shortForecast })
					.setTimestamp();

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${generateSnowflake()}`);
				}

				await message.edit({ content: msg.$deleteToDeleteSubheading(), embeds: [embed] });
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger.error('Could not fetch required resource(s), deleting corresponding record', { guildId, channelId, messageId, code, message });

						await db.forecastDestination.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
