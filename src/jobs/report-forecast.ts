import { db } from '@db';
import { _ } from '@lib/i18n';
import { BaseJob } from '@jobs';
import { Tokens } from '@container';
import { Colors } from '@constants';
import { v7 as uuidv7 } from 'uuid';
import { Duration } from '@sapphire/time-utilities';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { Container } from '@container';
import type { WeatherGoat } from '@lib/client';
import type { ILocationService } from '@services/location';
import type { IForecastService } from '@services/forecast';

export default class ReportForecastsJob extends BaseJob {
	private readonly _username: string;
	private readonly _reason: string;
	private readonly _location: ILocationService;
	private readonly _forecast: IForecastService;

	public constructor(container: Container) {
		super({
			name: 'com.weathergoat.jobs.ReportForecasts',
			pattern: '0 * * * *',
			runImmediately: true
		});

		this._username = 'WeatherGoat#Forecast';
		this._reason = 'Required for weather forecast reporting';
		this._location = container.resolve(Tokens.Location);
		this._forecast = container.resolve(Tokens.Forecast);
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.forecastDestination.findMany({
			select: {
				latitude: true,
				longitude: true,
				guildId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
			}
		});
		for (const { latitude, longitude, guildId, channelId, autoCleanup, radarImageUrl } of destinations) {
			const channel = await client.channels.fetch(channelId);

			if (!isTextChannel(channel)) continue;

			const forecast = await this._forecast.getForecastForCoordinates(latitude, longitude);
			const location = await this._location.getInfoFromCoordinates(latitude, longitude);
			const embed = new EmbedBuilder()
				.setTitle('⛅ ' + _('jobs.forecasts.embedTitle', { forecast, location }))
				.setColor(Colors.Primary)
				.setThumbnail(forecast.getIcon('large'))
				.setDescription(forecast.detailedForecast)
				.addFields({ name: _('jobs.forecasts.atAGlanceTitle'), value: forecast.shortForecast })
				.setTimestamp();

			if (radarImageUrl) {
				embed.setImage(radarImageUrl + `?${uuidv7()}`);
			}

			const webhook = await client.getOrCreateWebhook(channel, this._username, this._reason);

			const { id: messageId } = await webhook.send({
				username: this._username,
				avatarURL: client.user!.avatarURL({ forceStatic: false })!,
				embeds: [embed],
				flags: MessageFlags.SuppressNotifications
			});

			if (autoCleanup) {
				await db.volatileMessage.create({
					data: {
						guildId,
						channelId,
						messageId,
						expiresAt: new Duration('4h').fromNow
					}
				});
			}
		}
	}
}
