import { db } from '@db';
import { BaseJob } from '@jobs';
import { Flag } from '@lib/flag';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { AlertSeverity } from '@models/Alert';
import { HTTPRequestError } from '@lib/errors';
import { AlertsService } from '@services/alerts';
import { SweeperService } from '@services/sweeper';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { EventBusService } from '@services/event-bus';
import { time, Collection, EmbedBuilder } from 'discord.js';
import { EmbedLimits, isTextChannel } from '@sapphire/discord.js-utilities';
import type { Alert } from '@models/Alert';
import type { TextChannel } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { AlertDestination } from '@db/generated/client';

@injectable()
export default class ReportAlertsJob extends BaseJob {
	private readonly hasIndexedFlag  = new Flag(false);
	private readonly ugcIndex        = new Collection<string, AlertDestination[]>();
	private readonly webhookUsername = 'WeatherGoat#Alerts' as const;

	public constructor(
		private readonly eventBus = inject(EventBusService),
		private readonly alerts   = inject(AlertsService),
		private readonly sweeper  = inject(SweeperService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: 'report_alerts',
			pattern: '*/30 * * * * *',
			runImmediately: true
		});

		this.eventBus.on('alert-destinations:updated', () => this.hasIndexedFlag.setFalse());
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableAlertReporting')) {
			return;
		}

		if (this.hasIndexedFlag.isFalse) {
			this.logger.info('Indexing destinations...');

			const allDestinations = await db.alertDestination.findMany();
			for (const destination of allDestinations) {
				if (!this.ugcIndex.has(destination.countyId)) {
					this.ugcIndex.set(destination.countyId, [])
				}

				if (!this.ugcIndex.has(destination.zoneId)) {
					this.ugcIndex.set(destination.zoneId, [])
				}

				this.ugcIndex.get(destination.countyId)!.push(destination)
				this.ugcIndex.get(destination.zoneId)!.push(destination)
			}

			this.hasIndexedFlag.setTrue();

			this.logger.info(`Finished indexing ${allDestinations.length} destination(s)`);
		}

		const destinationMap = new Map<string, AlertDestination[]>();
		const alerts         = await this.alerts.getActiveAlerts();
		for (const alert of alerts) {
			const ugcs = alert.geocode.UGC;
			const matched = new Set<AlertDestination>();

			for (const ugc of ugcs) {
				for (const d of this.ugcIndex.get(ugc) ?? []) {
					matched.add(d);
				}
			}

			if (matched.size) {
				destinationMap.set(alert.id, [...matched]);
			}
		}

		for (const alert of alerts) {
			const expiredReferenceIds = new Set<string>();

			// Enqueue expired alert messages to be deleted immediately
			if (alert.expiredReferences) {
				for (const expiredReference of alert.expiredReferences) {
					expiredReferenceIds.add(expiredReference.alertId);
				}
			}

			const destinations = destinationMap.get(alert.id);
			if (!destinations?.length) {
				continue;
			}

			for (const { countyId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
				try {
					const channel = await client.channels.fetch(channelId);
					if (!isTextChannel(channel)) {
						continue;
					}

					const existing = await db.sentAlert.findFirst({
						where: {
							alertId: alert.id,
							guildId,
							channelId
						}
					});
					if (existing) {
						continue;
					}

					const webhook     = await this.getOrCreateWebhook(channel);
					const description = alert.description.toCodeBlock('md');
					const embed = new EmbedBuilder()
						.setTitle(`${alert.isUpdate ? '🔁 ' + $msg.jobs.alerts.updateTag() : '🚨'} ${alert.headline}`)
						.setDescription(description)
						.setColor(this.getAlertSeverityColor(alert))
						.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
						.setURL(alert.url)
						.addFields(
							{ name: $msg.jobs.alerts.fieldTitles.certainty(), value: alert.certainty, inline: true },
							{ name: $msg.jobs.alerts.fieldTitles.effective(), value: time(alert.effective, 'R'), inline: true },
							{ name: $msg.jobs.alerts.fieldTitles.expires(), value: time(alert.expires, 'R'), inline: true },
							{ name: $msg.jobs.alerts.fieldTitles.affectedAreas(), value: alert.areaDesc }
						)
						.setTimestamp();

					if (alert.instruction) {
						embed.addFields({ name: $msg.jobs.alerts.fieldTitles.instructions(), value: alert.instruction.toCodeBlock('md') });
					}

					if (radarImageUrl) {
						embed.setImage(radarImageUrl + `?${generateSnowflake()}`);
					}

					if (embed.length > EmbedLimits.MaximumTotalCharacters) {
						embed.setDescription($msg.jobs.alerts.payloadTooLargePlaceholder(alert.url));
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

					if (expiredReferenceIds.size) {
						const expiredSentAlerts = await db.sentAlert.findMany({
							where: {
								guildId,
								channelId,
								alertId: {
									in: [...expiredReferenceIds]
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

						for (const alertId of expiredReferenceIds) {
							const expiredSentAlert = byAlertId.get(alertId);
							if (!expiredSentAlert) {
								continue;
							}

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
