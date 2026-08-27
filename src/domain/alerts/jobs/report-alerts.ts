import { db } from '@database';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { HTTPRequestError } from '@errors';
import { AlertSeverity } from '@models/Alert';
import { Flag } from '@depthbomb/common/state';
import { AlertsService } from '@services/alerts';
import { BannerService } from '@services/banner';
import { ALERT_SEVERITY_COLORS } from '@constants';
import { generateSnowflake } from '@lib/snowflake';
import { SweeperService } from '@services/sweeper';
import { FeaturesService } from '@services/features';
import { EventBusService } from '@services/event-bus';
import { isUndefined } from '@depthbomb/common/guards';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { time, Collection, MessageFlags, ContainerBuilder, AttachmentBuilder, SeparatorSpacingSize } from 'discord.js';
import type { Alert } from '@models/Alert';
import type { TextChannel } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { AlertDestination } from '@database/generated/client';

const SENT_ALERT_QUERY_BATCH_SIZE = 500;

export class ReportAlertsJob extends BaseJob {
	private readonly hasIndexedFlag  = new Flag(false);
	private readonly ugcIndex        = new Collection<string, AlertDestination[]>();
	private readonly webhookUsername = 'WeatherGoat#Alerts' as const;

	public constructor(
		private readonly eventBus = inject(EventBusService),
		private readonly alerts   = inject(AlertsService),
		private readonly sweeper  = inject(SweeperService),
		private readonly banner   = inject(BannerService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: ReportAlertsJob.name,
			interval: '30s',
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

			this.ugcIndex.clear();

			const allDestinations = await db.alertDestination.findMany({
				where: {
					OR: [
						{ expiresAt: null },
						{ expiresAt: { gt: new Date() } }
					]
				}
			});
			for (const destination of allDestinations) {
				if (!this.ugcIndex.has(destination.countyId)) {
					this.ugcIndex.set(destination.countyId, []);
				}

				if (!this.ugcIndex.has(destination.zoneId)) {
					this.ugcIndex.set(destination.zoneId, []);
				}

				this.ugcIndex.get(destination.countyId)!.push(destination);
				this.ugcIndex.get(destination.zoneId)!.push(destination);
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

		if (destinationMap.size === 0) {
			return;
		}

		const relevantAlertIds = new Set(destinationMap.keys());
		for (const alert of alerts) {
			if (!destinationMap.has(alert.id)) {
				continue;
			}

			for (const reference of alert.expiredReferences ?? []) {
				relevantAlertIds.add(reference.alertId);
			}
		}

		const sentAlerts      = await this.loadSentAlerts(relevantAlertIds);
		const channelRequests = new Map<string, ReturnType<typeof client.channels.fetch>>();
		const webhookRequests = new Map<string, ReturnType<typeof this.getOrCreateWebhook>>();
		const fetchChannel    = (channelId: string) => {
			let request = channelRequests.get(channelId);
			if (!request) {
				request = client.channels.fetch(channelId);
				channelRequests.set(channelId, request);
			}

			return request;
		};
		const fetchWebhook    = (channel: TextChannel) => {
			let request = webhookRequests.get(channel.id);
			if (!request) {
				request = this.getOrCreateWebhook(channel);
				webhookRequests.set(channel.id, request);
			}

			return request;
		};

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

			for (const { latitude, longitude, countyId, guildId, channelId, autoCleanup, radarImageUrl, expiresAt } of destinations) {
				try {
					if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
						continue;
					}

					const sentAlertKey = this.createSentAlertKey(alert.id, guildId, channelId);
					if (sentAlerts.has(sentAlertKey)) {
						continue;
					}

					const channel = await fetchChannel(channelId);
					if (!isTextChannel(channel)) {
						continue;
					}

					const webhook     = await fetchWebhook(channel);
					const description = alert.description.toCodeBlock('md');
					const container   = new ContainerBuilder()
						.setAccentColor(this.getAlertSeverityColor(alert))
						.addMediaGalleryComponents(g => g
							.addItems(i => i
								.setURL('attachment://banner.png')
							)
						)
						.addTextDisplayComponents(t => t
							.setContent($msg.alerts.job.headline(
								alert.isUpdate ? `${$msg.alerts.job.updateTag()} ` : '',
								alert.headline,
								alert.certainty
							))
						);

					if (description.length > 2_000) {
						container.addTextDisplayComponents(t => t
							.setContent($msg.alerts.job.payloadTooLargePlaceholder(
								latitude,
								longitude,
								`#alert_${alert.id.split('.').slice(-3).join('_')}`
							))
						);
					} else {
						container.addTextDisplayComponents(t => t.setContent(alert.description.toCodeBlock('md')));
					}

					container
						.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Large))
						.addTextDisplayComponents(t => t
							.setContent($msg.alerts.job.term(time(alert.effective, 'R'), time(alert.expires, 'R')))
						)
						.addTextDisplayComponents(t => t
							.setContent($msg.alerts.job.affectedAreas(alert.areaDesc))
						);

					const instructions = alert.instruction;
					if (!isUndefined(instructions)) {
						container.addTextDisplayComponents(t => t.setContent($msg.alerts.job.instructions(instructions.toCodeBlock('md'))));
					}

					if (radarImageUrl) {
						container.addMediaGalleryComponents(g => g
							.addItems(i => i
								.setURL(radarImageUrl + `?v=${generateSnowflake()}`)
							)
						);
					}

					const banner      = await this.banner.generateBanner(alert);
					const attachment  = new AttachmentBuilder(banner, { name: 'banner.png' });
					const sentMessage = await webhook.send({
						username: this.webhookUsername,
						avatarURL: client.user.avatarURL()!,
						files: [attachment],
						components: [container],
						flags: MessageFlags.IsComponentsV2
					});

					if (autoCleanup) {
						const expiresAt = alert.expires;
						await this.sweeper.enqueueMessage(sentMessage, expiresAt);
					}

					const sentAlert = await db.sentAlert.create({
						data: {
							alertId: alert.id,
							guildId,
							channelId: channelId,
							messageId: sentMessage.id,
							expiresAt: alert.expires
						},
						select: {
							alertId: true,
							guildId: true,
							channelId: true,
							messageId: true
						}
					});
					sentAlerts.set(sentAlertKey, sentAlert);

					if (expiredReferenceIds.size) {
						for (const alertId of expiredReferenceIds) {
							const expiredSentAlert = sentAlerts.get(this.createSentAlertKey(alertId, guildId, channelId));
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

	private async loadSentAlerts(alertIds: Set<string>) {
		const byDestination = new Map<string, {
			alertId: string;
			guildId: string;
			channelId: string;
			messageId: string;
		}>();
		const ids = [...alertIds];

		for (let offset = 0; offset < ids.length; offset += SENT_ALERT_QUERY_BATCH_SIZE) {
			const batch = await db.sentAlert.findMany({
				where: {
					alertId: { in: ids.slice(offset, offset + SENT_ALERT_QUERY_BATCH_SIZE) }
				},
				select: {
					alertId: true,
					guildId: true,
					channelId: true,
					messageId: true
				}
			});

			for (const sentAlert of batch) {
				byDestination.set(
					this.createSentAlertKey(sentAlert.alertId, sentAlert.guildId, sentAlert.channelId),
					sentAlert
				);
			}
		}

		return byDestination;
	}

	private createSentAlertKey(alertId: string, guildId: string, channelId: string) {
		return `${alertId}\u0000${guildId}\u0000${channelId}`;
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
				return ALERT_SEVERITY_COLORS.Unknown[0];
			case AlertSeverity.Minor:
				return ALERT_SEVERITY_COLORS.Minor[0];
			case AlertSeverity.Moderate:
				return ALERT_SEVERITY_COLORS.Moderate[0];
			case AlertSeverity.Severe:
				return ALERT_SEVERITY_COLORS.Severe[0];
			case AlertSeverity.Extreme:
				return ALERT_SEVERITY_COLORS.Extreme[0];
		}
	}
}
