import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { tokens } from '@container';
import { v7 as uuidv7 } from 'uuid';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@client';
import type { Container } from '@container';
import type { ISweeperService } from '@services/sweeper';
import type { ILocationService } from '@services/location';
import type { IForecastService } from '@services/forecast';

export default class ReportForecastsJob extends BaseJob {
	private readonly _username: string;
	private readonly _reason: string;
	private readonly _location: ILocationService;
	private readonly _forecast: IForecastService;
	private readonly _sweeper: ISweeperService;

	public constructor(container: Container) {
		super({
			name: 'report_forecasts',
			pattern: '0 * * * *'
		});

		this._username = 'WeatherGoat#Forecast';
		this._reason = 'Required for weather forecast reporting';
		this._location = container.resolve(tokens.location);
		this._forecast = container.resolve(tokens.forecast);
		this._sweeper = container.resolve(tokens.sweeper);
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
				.setColor(Color.Primary)
				.setThumbnail(forecast.getIcon('large'))
				.setDescription(forecast.detailedForecast)
				.addFields({ name: _('jobs.forecasts.atAGlanceTitle'), value: forecast.shortForecast })
				.setTimestamp();

			if (radarImageUrl) {
				embed.setImage(radarImageUrl + `?${uuidv7()}`);
			}

			const webhook = await client.getOrCreateWebhook(channel, this._username, this._reason);
			const sentMessage = await webhook.send({
				username: this._username,
				avatarURL: client.user!.avatarURL({ forceStatic: false })!,
				embeds: [embed],
				flags: MessageFlags.SuppressNotifications
			});

			if (autoCleanup) {
				await this._sweeper.enqueueMessage(sentMessage, '4h');
			}
		}
	}
}
