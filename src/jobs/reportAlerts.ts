import { db } from '@db';
import { Job } from '@jobs';
import { getActiveAlertsForZone } from '@lib/alerts';
import { sentAlerts, volatileMessages } from '@db/schemas';
import { time, codeBlock, EmbedBuilder } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { WeatherGoat } from '@lib/client';

export default class ReportAlertsJob extends Job {
	private readonly _webhookName: string;
	private readonly _webhookReason: string;

	public constructor() {
		super({ name: 'alerts.report', pattern: '*/15 * * * * *', runImmediately: true, waitUntilReady: true });

		this._webhookName = 'WeatherGoat#Alerts';
		this._webhookReason = 'Required for weather alert reporting';
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.query.alertDestinations.findMany();
		for (const { zoneId, countyId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			const alerts = await getActiveAlertsForZone(zoneId, countyId);
			for (const alert of alerts) {
				const alertAlreadyReported = await db.query.sentAlerts.findFirst({
					where: (a, { eq, and }) => and(
						eq(a.alertId, alert.id),
						eq(a.guildId, channel.guildId),
						eq(a.channelId, channelId)
					)
				});
				if (alertAlreadyReported) {
					continue;
				}

				const isUpdate = alert.messageType === 'Update';
				const embed = new EmbedBuilder()
					.setTitle(`🚨 ${isUpdate ? '[UPDATE] ' : ''}${alert.headline}`)
					.setDescription(codeBlock(alert.description))
					.setColor(alert.severityColor)
					.setFooter({ text: alert.event })
					.addFields(
						{ name: 'Certainty', value: alert.certainty, inline: true },
						{ name: 'Effective', value: time(alert.effective, 'R'), inline: true },
						{ name: 'Expires', value: time(alert.expires, 'R'), inline: true },
						{ name: 'Affected Areas', value: alert.areaDesc }
					)
					.setTimestamp();

				if (alert.instructions) {
					embed.addFields({ name: 'Instructions', value: alert.instructions });
				}

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${client.generateId(16)}`);
				}

				const shouldPingEveryone = (alert.severity === 'Severe' || alert.severity === 'Extreme') && pingOnSevere;
				const webhook            = await client.getOrCreateWebhook(channel, this._webhookName, this._webhookReason);
				const { id: messageId }  = await webhook.send({
					content: shouldPingEveryone ? '@everyone' : '',
					username: this._webhookName,
					avatarURL: client.user!.avatarURL({ forceStatic: false })!,
					embeds: [embed]
				});

				if (autoCleanup) {
					const expiresAt = alert.expires;
					await db.insert(volatileMessages).values({
						channelId,
						messageId,
						expiresAt
					});
				}

				await db.insert(sentAlerts).values({
					alertId: alert.id,
					guildId: channel.guildId,
					channelId: channelId
				});
			}
		}
	}
}
