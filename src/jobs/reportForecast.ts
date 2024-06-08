import { db } from '@db';
import { Job } from '@jobs';
import { _ } from '@lib/i18n';
import { Duration } from '@sapphire/time-utilities';
import { locationService } from '@services/location';
import { forecastService } from '@services/forecast';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@lib/client';

export default class ReportForecastsJob extends Job {
	private readonly _webhookName: string;
	private readonly _webhookReason: string;

	public constructor() {
		super({ name: 'job.report-forecasts', pattern: '0 * * * *' });

		this._webhookName = 'WeatherGoat#Forecast';
		this._webhookReason = 'Required for weather forecast reporting';
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

			const forecast = await forecastService.getForecastForCoordinates(latitude, longitude);
			const location = await locationService.getInfoFromCoordinates(latitude, longitude);
			const embed = new EmbedBuilder()
				.setTitle(_('jobs.forecasts.embedTitle', { forecast, location }))
				.setColor(client.brandColor)
				.setThumbnail(forecast.icon.replace('medium', 'large'))
				.setDescription(forecast.detailedForecast)
				.addFields({ name: _('jobs.forecasts.atAGlanceTitle'), value: forecast.shortForecast })
				.setTimestamp();

			if (radarImageUrl) {
				embed.setImage(radarImageUrl + `?${client.generateId(16)}`);
			}

			const webhook = await client.getOrCreateWebhook(channel, this._webhookName, this._webhookReason);

			const { id: messageId } = await webhook.send({
				username: this._webhookName,
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
