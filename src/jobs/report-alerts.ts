import { db } from '@db';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { AlertSeverity } from '@models/Alert';
import { HTTPRequestError } from '@lib/errors';
import { time, EmbedBuilder } from 'discord.js';
import { AlertsService } from '@services/alerts';
import { SweeperService } from '@services/sweeper';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { EmbedLimits, isTextChannel } from '@sapphire/discord.js-utilities';
import type { Alert } from '@models/Alert';
import type { TextChannel } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class ReportAlertsJob extends BaseJob {
	private readonly webhookUsername = 'WeatherGoat#Alerts' as const;

	public constructor(
		private readonly alerts   = inject(AlertsService),
		private readonly sweeper  = inject(SweeperService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: 'report_alerts',
			pattern: '*/30 * * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableAlertReporting')) {
			return;
		}

		const destinations = await db.alertDestination.findMany({
			select: {
				countyId: true,
				guildId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
				pingOnSevere: true,
			}
		});
		const countyAlerts = new Map<string, Alert[]>();

		for (const { countyId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					continue;
				}

				let alerts = countyAlerts.get(countyId);
				if (!alerts) {
					alerts = (await this.alerts.getActiveAlertsForZone(countyId)).filter(a => a.isNotTest);
					countyAlerts.set(countyId, alerts);
				}

				if (!alerts.length) {
					continue;
				}

				const existing = await db.sentAlert.findMany({
					where: {
						alertId: { in: alerts.map(a => a.id) },
						guildId: channel.guildId,
						channelId
					},
					select: {
						alertId: true
					}
				});
				const reportedIDs         = new Set(existing.map(({ alertId }) => alertId));
				const expiredReferenceIDs = new Set<string>();
				const webhook             = await this.getOrCreateWebhook(channel);

				for (const alert of alerts) {
					if (reportedIDs.has(alert.id)) {
						continue;
					}

					const description = alert.description.toCodeBlock('md');
					const embed = new EmbedBuilder()
						.setTitle(`${alert.isUpdate ? '🔁 ' + msg.$jobsAlertsUpdateTag() : '🚨'} ${alert.headline}`)
						.setColor(this.getAlertSeverityColor(alert))
						.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
						.setURL(alert.url)
						.addFields(
							{ name: msg.$jobsAlertsCertaintyTitle(), value: alert.certainty, inline: true },
							{ name: msg.$jobsAlertsEffectiveTitle(), value: time(alert.effective, 'R'), inline: true },
							{ name: msg.$jobsAlertsExpiresTitle(), value: time(alert.expires, 'R'), inline: true },
							{ name: msg.$jobsAlertsAffectedAreasTitle(), value: alert.areaDesc }
						)
						.setTimestamp();

					if (alert.instruction) {
						embed.addFields({ name: msg.$jobsAlertsInstructionsTitle(), value: alert.instruction.toCodeBlock('md') });
					}

					if (radarImageUrl) {
						embed.setImage(radarImageUrl + `?${generateSnowflake()}`);
					}

					if (
						(embed.length + description.length) > EmbedLimits.MaximumTotalCharacters ||
						description.length > EmbedLimits.MaximumDescriptionLength
					) {
						embed.setDescription(msg.$jobsAlertsPayloadTooLargePlaceholder(alert.url));
					} else {
						embed.setDescription(description);
					}

					const shouldPingEveryone = (alert.severity === AlertSeverity.Severe || alert.severity === AlertSeverity.Extreme) && pingOnSevere;
					const sentMessage = await webhook.send({
						content: shouldPingEveryone ? '@everyone' : '',
						username: this.webhookUsername,
						avatarURL: client.user.avatarURL({ forceStatic: false })!,
						embeds: [embed]
					});

					if (autoCleanup) {
						const expiresAt = alert.expires;
						await this.sweeper.enqueueMessage(sentMessage, expiresAt);
					}

					await db.sentAlert.create({
						data: {
							alertId: alert.id,
							guildId,
							channelId: channelId,
							messageId: sentMessage.id
						}
					});
					reportedIDs.add(alert.id);

					// Enqueue expired alert messages to be deleted immediately
					if (alert.expiredReferences) {
						for (const expiredReference of alert.expiredReferences) {
							expiredReferenceIDs.add(expiredReference.alertId);
						}
					}
				}

				if (expiredReferenceIDs.size) {
					const expiredSentAlerts = await db.sentAlert.findMany({
						where: {
							guildId,
							channelId,
							alertId: {
								in: [...expiredReferenceIDs]
							}
						},
						select: {
							alertId: true,
							guildId: true,
							channelId: true,
							messageId: true
						}
					});

					const byAlertId = new Map<string, typeof expiredSentAlerts[number]>();
					for (const sent of expiredSentAlerts) {
						byAlertId.set(sent.alertId, sent);
					}

					for (const alertId of expiredReferenceIDs) {
						const expiredSentAlert = byAlertId.get(alertId);
						if (!expiredSentAlert) continue;

						await this.sweeper.enqueueMessage(
							expiredSentAlert.guildId,
							expiredSentAlert.channelId,
							expiredSentAlert.messageId,
							new Date()
						);
					}
				}
			} catch (err) {
				if (err instanceof HTTPRequestError && err.code === 503) {
					continue;
				}

				reportError('An error occurred while reporting alerts', err, { countyId, guildId, channelId });
			}
		}
	}

	private async getOrCreateWebhook(channel: TextChannel) {
		const reason   = 'Required for weather alert reporting';
		const webhooks = await channel.fetchWebhooks();
		let ourWebhook = webhooks.find(w => w.name === this.webhookUsername && w.client === channel.client);
		if (!ourWebhook) {
			ourWebhook = await channel.createWebhook({ name: this.webhookUsername, reason });

			this.logger.withMetadata({ name: this.webhookUsername, channel: channel.name }).info('Created webhook');
		}

		return ourWebhook;
	}

	private getAlertSeverityColor(alert: Alert) {
		switch (alert.severity) {
			default:
			case AlertSeverity.Unknown:
				return Color.SeverityUnknown;
			case AlertSeverity.Minor:
				return Color.SeverityMinor;
			case AlertSeverity.Moderate:
				return Color.SeverityModerate;
			case AlertSeverity.Severe:
				return Color.SeveritySevere;
			case AlertSeverity.Extreme:
				return Color.SeverityExtreme;
		}
	}
}
