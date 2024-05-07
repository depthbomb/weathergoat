import { db } from '@db';
import { Job } from '@jobs';
import { withQuery } from 'ufo';
import { getActiveAlertsForZone } from '@lib/alerts';
import { sentAlerts, volatileMessages } from '@db/schemas';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { time, codeBlock, EmbedBuilder, messageLink } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export default class ReportAlertsJob extends Job {
	private readonly _webhookName: string;
	private readonly _webhookReason: string;

	public constructor() {
		super({ name: 'job.report-alerts', pattern: '*/15 * * * * *', runImmediately: true });

		this._webhookName   = 'WeatherGoat#Alerts';
		this._webhookReason = 'Required for weather alert reporting';
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.query.alertDestinations.findMany();
		for (const { zoneId, countyId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			const guildId = channel.guildId;
			const alerts  = await getActiveAlertsForZone(zoneId, countyId);
			for (const alert of alerts) {
				const alertAlreadyReported = await db.query.sentAlerts.findFirst({
					where: (a, { eq, and }) => and(
						eq(a.alertId, alert.id),
						eq(a.guildId, channel.guildId),
						eq(a.channelId, channelId)
					)
				});

				if (alertAlreadyReported || alert.status === 'Exercise' || alert.status === 'Test') {
					continue;
				}

				const isUpdate     = alert.messageType === 'Update';
				const embed = new EmbedBuilder()
					.setTitle(`${isUpdate ? '🔁 [UPDATE]' : '🚨'} ${alert.headline}`)
					.setDescription(codeBlock(alert.description))
					.setColor(alert.severityColor)
					.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png', url: `mailto:${alert.sender}` })
					.setURL(withQuery('https://alerts.weather.gov/search', { id: alert.id }))
					.setFooter({ text: alert.event })
					.addFields(
						{ name: 'Certainty', value: alert.certainty, inline: true },
						{ name: 'Effective', value: time(alert.effective, 'R'), inline: true },
						{ name: 'Expires', value: time(alert.expires, 'R'), inline: true },
						{ name: 'Affected Areas', value: alert.areaDesc }
					)
					.setTimestamp();

				if (alert.instruction) {
					embed.addFields({ name: 'Instructions', value: codeBlock(alert.instruction) });
				}

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${client.generateId(16)}`);
				}

				if (alert.references.length) {
					const messageLinks = [] as string[];
					for (const { identifier } of alert.references) {
						const referencedSentAlert = await db.query.sentAlerts.findFirst({ where: (a, { eq }) => eq(a.alertId, identifier) });
						if (!referencedSentAlert) {
							continue;
						}

						messageLinks.push(
							messageLink(channelId, referencedSentAlert.messageId, guildId)
						);
					}

					if (messageLinks.length) {
						embed.addFields({ name: 'References', value: messageLinks.join('\n') });
					}
				}

				const shouldPingEveryone = !!((alert.severity === 'Severe' || alert.severity === 'Extreme') && pingOnSevere);
				const webhook            = await client.getOrCreateWebhook(channel, this._webhookName, this._webhookReason);
				const { id: messageId }  = await webhook.send({
					content: shouldPingEveryone ? '@everyone' : '',
					username: this._webhookName,
					avatarURL: client.user.avatarURL({ forceStatic: false })!,
					embeds: [embed]
				});

				if (autoCleanup) {
					const expiresAt = alert.expires;
					await db.insert(volatileMessages).values({
						guildId,
						channelId,
						messageId,
						expiresAt
					});
				}

				await db.insert(sentAlerts).values({
					alertId: alert.id,
					guildId,
					channelId: channelId,
					messageId,
					json: JSON.stringify(alert)
				});
			}
		}
	}
}
