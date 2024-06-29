import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { v7 as uuidv7 } from 'uuid';
import { tokens, Container } from '@container';
import { time, codeBlock, EmbedBuilder } from 'discord.js';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { Alert } from '@models/Alert';
import type { WeatherGoat } from '@client';
import type { IAlertsService } from '@services/alerts';
import type { ISweeperService } from '@services/sweeper';

export default class ReportAlertsJob extends BaseJob {
	private readonly _username: string;
	private readonly _reason: string;
	private readonly _alerts: IAlertsService;
	private readonly _sweeper: ISweeperService;

	public constructor(container: Container) {
		super({
			name: 'report_alerts',
			pattern: '*/30 * * * * *',
			runImmediately: true
		});

		this._username = 'WeatherGoat#Alerts';
		this._reason = 'Required for weather alert reporting';
		this._alerts = container.resolve(tokens.alerts);
		this._sweeper = container.resolve(tokens.sweeper);
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
							await this._sweeper.enqueueMessage(
								referencedSentAlert.guildId,
								referencedSentAlert.channelId,
								referencedSentAlert.messageId,
								new Date()
							);
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
				const sentMessage = await webhook.send({
					content: shouldPingEveryone ? '@everyone' : '',
					username: this._username,
					avatarURL: client.user.avatarURL({ forceStatic: false })!,
					embeds: [embed]
				});

				if (autoCleanup) {
					const expiresAt = alert.expires;
					await this._sweeper.enqueueMessage(sentMessage, expiresAt);
				}

				await db.sentAlert.create({
					data: {
						alertId: alert.id,
						guildId,
						channelId: channelId,
						messageId: sentMessage.id,
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

						await this._sweeper.enqueueMessage(
							expiredSentAlert.guildId,
							expiredSentAlert.channelId,
							expiredSentAlert.messageId,
							new Date()
						);
					}
				}
			}
		}
	}

	private _getAlertSeverityColor(alert: Alert) {
		switch (alert.severity) {
			case 'Unknown':
				return Color.SeverityUnknown;
			case 'Minor':
				return Color.SeverityMinor;
			case 'Moderate':
				return Color.SeverityModerate;
			case 'Severe':
				return Color.SeveritySevere;
			case 'Extreme':
				return Color.SeverityExtreme;
		}
	}
}
