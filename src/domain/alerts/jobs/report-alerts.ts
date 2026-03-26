import { db } from '@database';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { reportError } from '@lib/logger';
import { HTTPRequestError } from '@errors';
import { AlertSeverity } from '@models/Alert';
import { Flag } from '@depthbomb/common/state';
import { AlertsService } from '@services/alerts';
import { Color, IMAGE_ASSETS } from '@constants';
import { generateSnowflake } from '@lib/snowflake';
import { SweeperService } from '@services/sweeper';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { EventBusService } from '@services/event-bus';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { time, Collection, MessageFlags, ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { Alert } from '@models/Alert';
import type { TextChannel } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { AlertDestination } from '@database/generated/client';

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
			name: ReportAlertsJob.name,
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

		const destinationMap = new Collection<string, AlertDestination[]>();
		const alerts         = await this.alerts.getActiveAlerts();
		for (const alert of alerts) {
			const ugcs = alert.geocode.UGC;
			if (!ugcs) {
				continue;
			}

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

			for (const { latitude, longitude, countyId, guildId, channelId, autoCleanup, radarImageUrl } of destinations) {
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
					const container   = new ContainerBuilder()
						.setAccentColor(this.getAlertSeverityColor(alert))
						.addMediaGalleryComponents(g => g
							.addItems(i => i
								.setURL(this.getAlertSeverityBanner(alert))
							)
						)
						.addTextDisplayComponents(t => t
							.setContent(`## ${alert.isUpdate ? $msg.jobs.alerts.updateTag() : '🚨'} ${alert.headline} (${alert.certainty})`)
						)
						.addSeparatorComponents(s => s
							.setSpacing(SeparatorSpacingSize.Large)
						)

					if (description.length > 2_000) {
						container.addTextDisplayComponents(t => t
							.setContent($msg.jobs.alerts.payloadTooLargePlaceholder(
								latitude,
								longitude,
								`#alert_${alert.id.split('.').slice(-3).join('_')}`
							))
						);
					} else {
						container.addTextDisplayComponents(t => t
							.setContent(alert.description.toCodeBlock('md'))
						);
					}

					container.addTextDisplayComponents(t => t
						.setContent(`This alert is effective as of ${time(alert.effective, 'R')}, expires ${time(alert.expires, 'R')}, and affects the following areas:\n**${alert.areaDesc}**`)
					);

					if (alert.instruction) {
						container.addTextDisplayComponents(t => t.setContent(`### Instructions\n${alert.instruction!.toCodeBlock('md')}`));
					}

					if (radarImageUrl) {
						container.addMediaGalleryComponents(g => g
							.addItems(i => i
								.setURL(radarImageUrl + `?${generateSnowflake()}`)
							)
						);
					}

					const sentMessage = await webhook.send({
						username: this.webhookUsername,
						avatarURL: client.user.avatarURL()!,
						components: [container],
						flags: MessageFlags.IsComponentsV2
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

						const byAlertId = new Collection<string, typeof expiredSentAlerts[number]>();
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

	private getAlertSeverityBanner(alert: Alert) {
		switch (alert.severity) {
			default:
			case AlertSeverity.Unknown:
				return IMAGE_ASSETS['alert-banner-unknown'];
			case AlertSeverity.Minor:
				return IMAGE_ASSETS['alert-banner-minor'];
			case AlertSeverity.Moderate:
				return IMAGE_ASSETS['alert-banner-minor'];
			case AlertSeverity.Severe:
				return IMAGE_ASSETS['alert-banner-severe'];
			case AlertSeverity.Extreme:
				return IMAGE_ASSETS['alert-banner-extreme'];
		}
	}

	private createLinkAnchor(alertId: string) {
		return `alert_${alertId.split('.').slice(-3).join('_')}`;
	}
}
