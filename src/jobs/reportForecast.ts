import { db } from '@db';
import { Job } from '@jobs';
import { volatileMessages } from '@db/schemas';
import { Duration } from '@sapphire/time-utilities';
import { getInfoFromCoordinates } from '@lib/location';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getForecastForCoordinates } from '@lib/forecast';
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
		const destinations = await db.query.forecastDestinations.findMany();
		for (const { latitude, longitude, channelId, autoCleanup, radarImageUrl } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			const forecast = await getForecastForCoordinates(latitude, longitude);
			const location = await getInfoFromCoordinates(latitude, longitude);
			const embed = new EmbedBuilder()
				.setTitle(`⛅ ${forecast.name}'s Forecast for ${location.location}`)
				.setColor('#06b6d4')
				.setThumbnail(forecast.icon.replace('medium', 'large'))
				.setDescription(forecast.detailedForecast)
				.addFields(
					{ name: 'At a glance', value: forecast.shortForecast }
				)
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
				await db.insert(volatileMessages).values({
					channelId,
					messageId,
					expiresAt: new Duration('4h').fromNow
				});
			}
		}
	}
}
