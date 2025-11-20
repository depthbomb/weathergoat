import { db } from '@db';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { msg } from '@lib/messages';
import { HTTPRequestError } from '@lib/errors';
import { AlertsService } from '@services/alerts';
import { logger, reportError } from '@lib/logger';
import { generateSnowflake } from '@lib/snowflake';
import { SweeperService } from '@services/sweeper';
import { inject, injectable } from '@needle-di/core';
import { time, codeBlock, EmbedBuilder } from 'discord.js';
import { EmbedLimits, isTextChannel } from '@sapphire/discord.js-utilities';
import type { LogLayer } from 'loglayer';
import type { Alert } from '@models/Alert';
import type { WeatherGoat } from '@lib/client';
import type { TextChannel } from 'discord.js';

@injectable()
export default class ReportAlertsJob extends BaseJob {
	private readonly logger: LogLayer;
	private readonly webhookUsername = 'WeatherGoat#Alerts' as const;

	public constructor(
		private readonly alerts = inject(AlertsService),
		private readonly sweeper = inject(SweeperService)
	) {
		super({
			name: 'report_alerts',
			pattern: '*/30 * * * * *',
			runImmediately: true
		});

		this.logger = logger.child().withPrefix(`[Job::${this.name}]`);
	}

	public async execute(client: WeatherGoat<true>) {
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
		for (const { countyId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			try {
				const alerts = await this.alerts.getActiveAlertsForZone(countyId);
				for (const alert of alerts.filter(a => a.isNotTest)) {
					const alreadyReported = await db.sentAlert.findFirst({
						where: {
							alertId: alert.id,
							guildId: channel.guildId,
							channelId
						}
					});
					if (alreadyReported) {
						continue;
					}

					const description = codeBlock('md', alert.description);
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
						embed.addFields({ name: msg.$jobsAlertsInstructionsTitle(), value: codeBlock('md', alert.instruction) });
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

					const shouldPingEveryone = !!(
						(alert.severity === 'Severe' || alert.severity === 'Extreme') &&
						(!alert.event.includes('Excessive Heat Warning') && !alert.event.includes('Heat Advisory')) &&
						pingOnSevere
					);
					const webhook     = await this.getOrCreateWebhook(channel);
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
							messageId: sentMessage.id,
							json: alert.json
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

							await this.sweeper.enqueueMessage(
								expiredSentAlert.guildId,
								expiredSentAlert.channelId,
								expiredSentAlert.messageId,
								new Date()
							);
						}
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
