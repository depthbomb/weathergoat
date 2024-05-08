import { db } from '@db';
import { Job } from '@jobs';
import { withQuery } from 'ufo';
import { getActiveAlertsForZone } from '@lib/alerts';
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
		const destinations = await db.alertDestination.findMany({
			select: {
				zoneId: true,
				countyId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
				pingOnSevere: true,
			}
		});
		for (const { zoneId, countyId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			const guildId = channel.guildId;
			const alerts  = await getActiveAlertsForZone(zoneId, countyId);
			for (const alert of alerts) {
				const alreadyReported = await db.sentAlert.findFirst({
					where: {
						alertId: alert.id,
						guildId: channel.guildId,
						channelId
					}
				});
				if (alreadyReported || alert.status === 'Exercise' || alert.status === 'Test') {
					continue;
				}

				const isUpdate = alert.messageType === 'Update';
				const embed = new EmbedBuilder()
					.setTitle(`${isUpdate ? '🔁 [UPDATE]' : '🚨'} ${alert.headline}`)
					.setDescription(codeBlock(alert.description))
					.setColor(alert.severityColor)
					.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
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
						const referencedSentAlert = await db.sentAlert.findFirst({ where: { alertId: identifier } });
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
					await db.volatileMessage.create({
						data: {
							guildId,
							channelId,
							messageId,
							expiresAt
						}
					});
				}

				await db.sentAlert.create({
					data: {
						alertId: alert.id,
						guildId,
						channelId: channelId,
						messageId,
						json: JSON.stringify(alert)
					}
				});
			}
		}
	}
}
