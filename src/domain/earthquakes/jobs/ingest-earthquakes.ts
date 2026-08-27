import { env } from '@env';
import { db } from '@database';
import { Prisma } from '@database/generated/client';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { PermissionsBitField } from 'discord.js';
import { EarthquakeService, earthquakeDistanceKm } from '@services/earthquakes';
import { isEarthquakeEligible, determineDeliveryAction } from '../delivery-policy';
import { RedisLease, RedisLeaseService, RedisLeaseLostError } from '@services/redis-lease';
import { EarthquakeDeliveryProcessor } from '../delivery-processor';
import type { EarthquakeDeliveryDiscord, EarthquakeDeliveryStore } from '../delivery-processor';
import type { WeatherGoat } from '@lib/client';
import type { EarthquakeEvent } from '@models/Earthquake';

const INGESTION_STATE_ID = 'usgs-all-day-v1';
const LEASE_KEY = 'leases:earthquake-ingestion';
const LEASE_TTL_MS = 90_000;
const LEASE_RENEW_MS = 30_000;
const DELIVERY_CLAIM_MS = 60_000;
const RETENTION_MS = 35 * 24 * 60 * 60 * 1_000;

const DELIVERY_PERMISSIONS = new PermissionsBitField([
	PermissionsBitField.Flags.ViewChannel,
	PermissionsBitField.Flags.SendMessages,
	PermissionsBitField.Flags.EmbedLinks,
	PermissionsBitField.Flags.ReadMessageHistory
]);

function eventData(event: EarthquakeEvent, observedAt: Date) {
	return {
		sourceUpdatedAt: event.updatedAt,
		eventTime: event.occurredAt,
		lastObservedAt: observedAt,
		magnitude: event.magnitude,
		magnitudeType: event.magnitudeType,
		place: event.place,
		status: event.sourceStatus,
		eventType: event.eventType,
		longitude: event.coordinates.longitude,
		latitude: event.coordinates.latitude,
		depthKm: event.coordinates.depthKm,
		significance: event.significance,
		felt: event.feltReports,
		tsunami: event.tsunamiFlag ?? false,
		url: event.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(event.id)}`,
		detailUrl: event.detailUrl,
		productMetadata: event.products.length ? JSON.stringify(event.products).slice(0, 64_000) : null
	};
}

export class IngestEarthquakesJob extends BaseJob {
	public constructor(
		private readonly earthquakes = inject(EarthquakeService),
		private readonly features = inject(FeaturesService),
		private readonly leases = inject(RedisLeaseService)
	) {
		super({
			name: IngestEarthquakesJob.name,
			interval: '1m',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableEarthquakeIngestion')) {
			return;
		}

		const lease = await this.leases.acquire(LEASE_KEY, LEASE_TTL_MS);
		if (!lease) {
			this.logger.debug('Another worker owns the earthquake ingestion lease');
			return;
		}

		await Bun.sleep(Math.floor(Math.random() * 5_001));
		lease.assertHeld();

		let renewalFailure: unknown;
		let renewalPromise: Promise<void> | undefined;
		const renewal = setInterval(() => {
			renewalPromise ??= lease.renew()
				.catch(err => {
					renewalFailure = err;
					reportError('Earthquake ingestion lease renewal failed', err);
				})
				.finally(() => {
					renewalPromise = undefined;
				});
		}, LEASE_RENEW_MS);

		try {
			await this.ingest(client, lease, () => renewalFailure);
		} finally {
			clearInterval(renewal);
			await renewalPromise;

			if (lease.held) {
				await lease.release();
			}
		}
	}

	private async ingest(client: WeatherGoat<true>, lease: RedisLease, getRenewalFailure: () => unknown) {
		const startedAt = new Date();
		const state = await db.earthquakeIngestionState.findUnique({ where: { id: INGESTION_STATE_ID } });

		try {
			const feedResult = await this.earthquakes.getAllDayFeedResult({
				lastModified: state?.lastModified ?? undefined
			});
			if (feedResult.notModified) {
				await db.earthquakeIngestionState.upsert({
					where: { id: INGESTION_STATE_ID },
					create: {
						id: INGESTION_STATE_ID,
						lastModified: feedResult.validators.lastModified,
						baselinedAt: startedAt,
						lastSuccessAt: startedAt
					},
					update: {
						lastModified: feedResult.validators.lastModified ?? state?.lastModified,
						lastSuccessAt: startedAt,
						lastFailureAt: null,
						lastError: null
					}
				});

				this.logger.debug('USGS earthquake feed was not modified');
				return;
			}

			const feed = feedResult.collection;

			this.assertLease(lease, getRenewalFailure());

			const ids = feed.events.map(event => event.id);
			const previousEvents = ids.length
				? await db.earthquakeEvent.findMany({ where: { id: { in: ids } } })
				: [];
			const previousById = new Map(previousEvents.map(event => [event.id, event]));
			const isBaseline = !state?.baselinedAt;

			if (feed.events.length) {
				await db.$transaction(feed.events.map(event => db.earthquakeEvent.upsert({
					where: { id: event.id },
					create: {
						id: event.id,
						firstObservedAt: startedAt,
						...eventData(event, startedAt)
					},
					update: eventData(event, startedAt)
				})));
			}

			await db.earthquakeIngestionState.upsert({
				where: { id: INGESTION_STATE_ID },
				create: {
					id: INGESTION_STATE_ID,
					lastModified: feedResult.validators.lastModified,
					lastGeneratedAt: feed.generatedAt,
					baselinedAt: startedAt,
					lastSuccessAt: startedAt
				},
				update: {
					lastModified: feedResult.validators.lastModified ?? state?.lastModified,
					lastGeneratedAt: feed.generatedAt,
					lastSuccessAt: startedAt,
					lastFailureAt: null,
					lastError: null,
					...(isBaseline ? { baselinedAt: startedAt } : {})
				}
			});

			if (!isBaseline) {
				await this.processRevisions(client, lease, getRenewalFailure, feed.events, previousById);
			}

			await db.earthquakeEvent.deleteMany({
				where: {
					lastObservedAt: { lt: new Date(startedAt.getTime() - RETENTION_MS) },
					deliveries: { none: {} }
				}
			});

			this.logger.withMetadata({
				events: feed.events.length,
				baseline: isBaseline,
				publicationEnabled: env.get('EARTHQUAKE_PUBLICATION_ENABLED'),
				generatedAt: feed.generatedAt
			}).info('Finished USGS earthquake ingestion');
		} catch (err) {
			await db.earthquakeIngestionState.upsert({
				where: { id: INGESTION_STATE_ID },
				create: {
					id: INGESTION_STATE_ID,
					lastFailureAt: new Date(),
					lastError: String(err).slice(0, 2_000)
				},
				update: {
					lastFailureAt: new Date(),
					lastError: String(err).slice(0, 2_000)
				}
			});

			throw err;
		}
	}

	private async processRevisions(
		client: WeatherGoat<true>,
		lease: RedisLease,
		getRenewalFailure: () => unknown,
		events: EarthquakeEvent[],
		previousById: Map<string, { sourceUpdatedAt: Date }>
	) {
		const revised = events.filter(event => {
			const previous = previousById.get(event.id);
			return !previous || event.updatedAt > previous.sourceUpdatedAt;
		});
		if (!revised.length) {
			return;
		}

		const subscriptions = await db.earthquakeSubscription.findMany();
		let matches = 0;
		for (const event of revised) {
			for (const subscription of subscriptions) {
				this.assertLease(lease, getRenewalFailure());

				const distanceKm = earthquakeDistanceKm(
					{ latitude: subscription.latitude, longitude: subscription.longitude, depthKm: 0 },
					event.coordinates
				);
				const eligible = isEarthquakeEligible(
					{ magnitude: event.magnitude, distanceKm },
					{ minimumMagnitude: subscription.minMagnitude, radiusKm: subscription.radiusKm }
				);
				const delivery = await db.earthquakeDelivery.findUnique({
					where: { subscriptionId_eventId: { subscriptionId: subscription.id, eventId: event.id } }
				});
				const action = determineDeliveryAction({
					hasDelivery: Boolean(delivery?.messageId || delivery?.attemptCount),
					isBaseline: false,
					isEligible: eligible,
					sourceUpdatedAt: event.updatedAt,
					deliveredRevisionAt: delivery?.deliveredRevisionAt ?? null
				});
				if (action === 'none') {
					continue;
				}

				matches++;
				if (!env.get('EARTHQUAKE_PUBLICATION_ENABLED')) {
					continue;
				}

				const deliveryId = delivery?.id ?? (await db.earthquakeDelivery.upsert({
					where: {
						subscriptionId_eventId: { subscriptionId: subscription.id, eventId: event.id }
					},
					create: {
						subscriptionId: subscription.id,
						eventId: event.id,
						firstEligibleAt: new Date(),
						lastEligible: eligible
					},
					update: {},
					select: { id: true }
				})).id;

				try {
					await this.deliver(client, lease, getRenewalFailure, deliveryId, event, distanceKm, eligible, action);
				} catch (err) {
					if (err instanceof RedisLeaseLostError) {
						throw err;
					}

					reportError('Earthquake delivery failed', err, { deliveryId, eventId: event.id });
				}
			}
		}

		this.logger.withMetadata({ revisions: revised.length, subscriptions: subscriptions.length, matches }).info('Evaluated earthquake revisions');
	}

	private async deliver(
		client: WeatherGoat<true>,
		lease: RedisLease,
		getRenewalFailure: () => unknown,
		deliveryId: number,
		event: EarthquakeEvent,
		distanceKm: number,
		eligible: boolean,
		action: 'create' | 'edit'
	) {
		const store: EarthquakeDeliveryStore = {
			claim: async input => {
				const actionGuard: Prisma.EarthquakeDeliveryWhereInput = input.action === 'create'
					? {
						messageId: null,
						deliveredRevisionAt: null,
						attemptCount: 0,
						state: { in: ['PENDING', 'FAILED'] }
					}
					: {
						OR: [
							{ deliveredRevisionAt: null },
							{ deliveredRevisionAt: { lt: input.sourceUpdatedAt } }
						]
					};
				const result = await db.earthquakeDelivery.updateMany({
					where: {
						id: input.deliveryId,
						AND: [
							{
								OR: [
									{ claimToken: null },
									{ claimExpiresAt: { lt: input.now } }
								]
							},
							actionGuard
						]
					},
					data: {
						claimToken: input.claimToken,
						claimExpiresAt: input.claimExpiresAt
					}
				});

				return result.count === 1;
			},
			getClaimed: async (id, claimToken) => {
				const claimed = await db.earthquakeDelivery.findFirstOrThrow({
					where: { id, claimToken },
					include: { subscription: true }
				});

				return {
					id: claimed.id,
					channelId: claimed.subscription.channelId,
					messageId: claimed.messageId,
					deliveredAt: claimed.deliveredAt
				};
			},
			markCreateStarted: async (id, claimToken) => {
				await db.earthquakeDelivery.update({
					where: { id, claimToken },
					data: { state: 'AMBIGUOUS', attemptCount: { increment: 1 } }
				});
			},
			markSent: async input => {
				await db.earthquakeDelivery.update({
					where: { id: input.deliveryId, claimToken: input.claimToken },
					data: {
						state: 'SENT',
						messageId: input.messageId,
						deliveredRevisionAt: input.deliveredRevisionAt,
						lastEligible: input.lastEligible,
						deliveredAt: input.deliveredAt,
						failedAt: null,
						error: null,
						claimToken: null,
						claimExpiresAt: null
					}
				});
			},
			markFailed: async input => {
				await db.earthquakeDelivery.updateMany({
					where: { id: input.deliveryId, claimToken: input.claimToken },
					data: {
						state: input.state,
						failedAt: input.failedAt,
						error: input.error,
						claimToken: null,
						claimExpiresAt: null
					}
				});
			}
		};
		const discord: EarthquakeDeliveryDiscord = {
			getGuildTextChannel: async (channelId: string) => {
				const channel = await client.channels.fetch(channelId);
				if (!channel?.isTextBased() || channel.isDMBased()) {
					return null;
				}

				return {
					hasRequiredPermissions: () => Boolean(channel.permissionsFor(client.user)?.has(DELIVERY_PERMISSIONS)),
					send: async payload => channel.send(payload),
					edit: async (messageId, payload) => {
						const message = await channel.messages.fetch(messageId);

						await message.edit(payload);
					}
				};
			}
		};
		const processor = new EarthquakeDeliveryProcessor({
			store,
			discord,
			clock: () => new Date(),
			claimToken: () => crypto.randomUUID(),
			claimTtlMs: DELIVERY_CLAIM_MS
		});

		await processor.deliver({
			deliveryId,
			event,
			distanceKm,
			eligible,
			action,
			assertCanDeliver: () => this.assertLease(lease, getRenewalFailure())
		});
	}

	private assertLease(lease: RedisLease, renewalFailure: unknown) {
		if (renewalFailure) {
			throw renewalFailure;
		}

		lease.assertHeld();
	}

}
