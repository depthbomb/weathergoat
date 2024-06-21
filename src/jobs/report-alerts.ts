import { db } from '@db';
import { _ } from '@lib/i18n';
import { BaseJob } from '@jobs';
import { Colors } from '@constants';
import { v7 as uuidv7 } from 'uuid';
import { Tokens, Container } from '@container';
import { time, codeBlock, EmbedBuilder } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { Alert } from '@models/Alert';
import type { WeatherGoat } from '@lib/client';
import type { IAlertsService } from '@services/alerts';

export default class ReportAlertsJob extends BaseJob {
	private readonly _alerts: IAlertsService;
	private readonly _username: string;
	private readonly _reason: string;

	public constructor(container: Container) {
		super({
			name: 'com.weathergoat.jobs.ReportAlerts',
			pattern: '*/30 * * * * *'
		});

		this._alerts = container.resolve(Tokens.Alerts);
		this._username = 'WeatherGoat#Alerts';
		this._reason = 'Required for weather alert reporting';
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.alertDestination.findMany({
			select: {
				zoneId: true,
				countyId: true,
				guildId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
				pingOnSevere: true,
			}
		});
		for (const { zoneId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);

			if (!isTextChannel(channel)) continue;

			const alerts = await this._alerts.getActiveAlertsForZone(zoneId);
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
					.setTitle(`${isUpdate ? '🔁 ' + _('jobs.alerts.updateTag') : '🚨'} ${alert.headline}`)
					.setDescription(codeBlock('md', alert.description))
					.setColor(this._getAlertSeverityColor(alert))
					.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
					.setURL(alert.url)
					.setFooter({ text: alert.event })
					.addFields(
						{ name: _('jobs.alerts.certaintyTitle'), value: alert.certainty, inline: true },
						{ name: _('jobs.alerts.effectiveTitle'), value: time(alert.effective, 'R'), inline: true },
						{ name: _('jobs.alerts.expiresTitle'), value: time(alert.expires, 'R'), inline: true },
						{ name: _('jobs.alerts.affectedAreasTitle'), value: alert.areaDesc }
					)
					.setTimestamp();

				if (alert.instruction) {
					embed.addFields({ name: _('jobs.alerts.instructionsTitle'), value: codeBlock('md', alert.instruction) });
				}

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${uuidv7()}`);
				}

				if (alert.references.length) {
					const alertUrls = [] as string[];
					for (const reference of alert.references) {
						const referencedSentAlert = await db.sentAlert.findFirst({ where: { alertId: reference.identifier } });
						if (referencedSentAlert) {
							// Enqueue parent alert messages to be deleted immediately
							await db.volatileMessage.create({
								data: {
									guildId: referencedSentAlert.guildId,
									channelId: referencedSentAlert.channelId,
									messageId: referencedSentAlert.messageId,
									expiresAt: new Date()
								}
							});
						}

						alertUrls.push(reference.url);
					}

					embed.addFields({ name: _('jobs.alerts.referencesTitle'), value: alertUrls.join('\n') })
				}

				const shouldPingEveryone = !!(
					(alert.severity === 'Severe' || alert.severity === 'Extreme') &&
					(!alert.event.includes('Excessive Heat Warning') && !alert.event.includes('Heat Advisory')) &&
					pingOnSevere
				);
				const webhook = await client.getOrCreateWebhook(channel, this._username, this._reason);
				const { id: messageId } = await webhook.send({
					content: shouldPingEveryone ? '@everyone' : '',
					username: this._username,
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

				// Enqueue expired alert messages to be deleted immediately
				if (alert.expiredReferences) {
					for (const expiredReference of alert.expiredReferences) {
						const expiredSentAlert = await db.sentAlert.findFirst({
							where: {
								alertId: expiredReference.alertId
							}
						});

						if (!expiredSentAlert) continue;

						await db.volatileMessage.create({
							data: {
								guildId: expiredSentAlert.guildId,
								channelId: expiredSentAlert.channelId,
								messageId: expiredSentAlert.messageId,
								expiresAt: new Date()
							}
						});
					}
				}
			}
		}
	}

	private _getAlertSeverityColor(alert: Alert) {
		switch (alert.severity) {
			case 'Unknown':
				return Colors.SeverityUnknown;
			case 'Minor':
				return Colors.SeverityMinor;
			case 'Moderate':
				return Colors.SeverityModerate;
			case 'Severe':
				return Colors.SeveritySevere;
			case 'Extreme':
				return Colors.SeverityExtreme;
		}
	}
}
