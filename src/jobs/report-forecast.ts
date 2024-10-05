import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { logger } from '@logger';
import { Color } from '@constants';
import { tokens } from '@container';
import { EmbedBuilder } from 'discord.js';
import { generateSnowflake } from '@snowflake';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@client';
import type { Container } from '@container';
import type { ILocationService } from '@services/location';
import type { IForecastService } from '@services/forecast';

export default class ReportForecastsJob extends BaseJob {
	private readonly _location: ILocationService;
	private readonly _forecast: IForecastService;

	public constructor(container: Container) {
		super({
			name: 'report_forecasts',
			pattern: '0 * * * *',
			runImmediately: true
		});

		this._location = container.resolve(tokens.location);
		this._forecast = container.resolve(tokens.forecast);
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.forecastDestination.findMany({
			select: {
				latitude: true,
				longitude: true,
				guildId: true,
				channelId: true,
				messageId: true,
				radarImageUrl: true,
			}
		});
		for (const { latitude, longitude, guildId, channelId, messageId, radarImageUrl } of destinations) {
			const guild = await client.guilds.fetch(guildId);
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

			const forecast = await this._forecast.getForecastForCoordinates(latitude, longitude);
			const location = await this._location.getInfoFromCoordinates(latitude, longitude);
			const embed = new EmbedBuilder()
				.setTitle('⛅ ' + _('jobs.forecasts.embedTitle', { forecast, location }))
				.setColor(Color.Primary)
				.setThumbnail(forecast.getIcon('large'))
				.setDescription(forecast.detailedForecast)
				.addFields({ name: _('jobs.forecasts.atAGlanceTitle'), value: forecast.shortForecast })
				.setTimestamp();

			if (radarImageUrl) {
				embed.setImage(radarImageUrl + `?${generateSnowflake()}`);
			}

			await message.edit({ content: _('common.deleteToDeleteSubheading'), embeds: [embed] });
		}
	}
}
