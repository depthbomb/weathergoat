import { DiscordAPIError } from 'discord.js';
import { buildEarthquakeEmbed } from './presentation';
import type { EarthquakeEvent } from '@models/Earthquake';

export type EarthquakeDeliveryAction = 'create' | 'edit';
export type EarthquakeDeliveryFailureState = 'AMBIGUOUS' | 'FAILED';

export type EarthquakeDeliveryRecord = {
	id: number;
	channelId: string;
	messageId: string | null;
	deliveredAt: Date | null;
};

export type EarthquakeDeliveryClaim = {
	deliveryId: number;
	claimToken: string;
	claimExpiresAt: Date;
	now: Date;
	action: EarthquakeDeliveryAction;
	sourceUpdatedAt: Date;
};

export type EarthquakeDeliverySuccess = {
	deliveryId: number;
	claimToken: string;
	messageId: string;
	deliveredRevisionAt: Date;
	lastEligible: boolean;
	deliveredAt: Date;
};

export type EarthquakeDeliveryFailure = {
	deliveryId: number;
	claimToken: string;
	state: EarthquakeDeliveryFailureState;
	failedAt: Date;
	error: string;
};

export interface EarthquakeDeliveryStore {
	/**
	 * Atomically acquires an absent/expired claim only while the requested revision still needs the
	 * requested action. A create claim must require no confirmed/ambiguous prior create; an edit
	 * claim must require deliveredRevisionAt to precede sourceUpdatedAt.
	 */
	claim(input: EarthquakeDeliveryClaim): Promise<boolean>;
	getClaimed(deliveryId: number, claimToken: string): Promise<EarthquakeDeliveryRecord>;
	markCreateStarted(deliveryId: number, claimToken: string): Promise<void>;
	markSent(input: EarthquakeDeliverySuccess): Promise<void>;
	markFailed(input: EarthquakeDeliveryFailure): Promise<void>;
}

export type EarthquakeDiscordMessagePayload = ReturnType<typeof earthquakeMessagePayload>;

export interface EarthquakeDeliveryChannel {
	hasRequiredPermissions(): boolean;
	send(payload: EarthquakeDiscordMessagePayload): Promise<{ id: string }>;
	edit(messageId: string, payload: EarthquakeDiscordMessagePayload): Promise<void>;
}

export interface EarthquakeDeliveryDiscord {
	getGuildTextChannel(channelId: string): Promise<EarthquakeDeliveryChannel | null>;
}

export type EarthquakeDeliveryRequest = {
	deliveryId: number;
	event: EarthquakeEvent;
	distanceKm: number;
	eligible: boolean;
	action: EarthquakeDeliveryAction;
	/** Checks the caller-owned ingestion lease before Discord side effects. */
	assertCanDeliver(): void;
};

export type EarthquakeDeliveryResult = 'not-claimed' | 'sent';

export type EarthquakeDeliveryProcessorOptions = {
	store: EarthquakeDeliveryStore;
	discord: EarthquakeDeliveryDiscord;
	clock: () => Date;
	claimToken: () => string;
	claimTtlMs: number;
};

function earthquakeMessagePayload(event: EarthquakeEvent, distanceKm: number, eligible: boolean, action: EarthquakeDeliveryAction) {
	return {
		embeds: [buildEarthquakeEmbed(event, {
			distanceKm,
			stillEligible: eligible,
			revisionNotice: action === 'edit'
		})],
		allowedMentions: { parse: [] as never[] }
	};
}

function deliveryError(error: unknown) {
	if (error instanceof DiscordAPIError) {
		return `Discord ${error.status}/${error.code}`.slice(0, 2_000);
	}

	return String(error).slice(0, 2_000);
}

export class EarthquakeDeliveryProcessor {
	private readonly store: EarthquakeDeliveryStore;
	private readonly discord: EarthquakeDeliveryDiscord;
	private readonly clock: () => Date;
	private readonly claimToken: () => string;
	private readonly claimTtlMs: number;

	public constructor(options: EarthquakeDeliveryProcessorOptions) {
		if (!Number.isSafeInteger(options.claimTtlMs) || options.claimTtlMs <= 0) {
			throw new RangeError('Earthquake delivery claim TTL must be a positive safe integer.');
		}

		this.store = options.store;
		this.discord = options.discord;
		this.clock = options.clock;
		this.claimToken = options.claimToken;
		this.claimTtlMs = options.claimTtlMs;
	}

	public async deliver(request: EarthquakeDeliveryRequest): Promise<EarthquakeDeliveryResult> {
		const claimToken = this.claimToken();
		const now = this.clock();
		const claimed = await this.store.claim({
			deliveryId: request.deliveryId,
			claimToken,
			claimExpiresAt: new Date(now.getTime() + this.claimTtlMs),
			now,
			action: request.action,
			sourceUpdatedAt: request.event.updatedAt
		});
		if (!claimed) {
			return 'not-claimed';
		}

		let createStarted = false;
		try {
			const delivery = await this.store.getClaimed(request.deliveryId, claimToken);

			request.assertCanDeliver();

			const channel = await this.discord.getGuildTextChannel(delivery.channelId);
			if (!channel) {
				throw new Error('Earthquake subscription channel is missing or is not a guild text channel.');
			}
			if (!channel.hasRequiredPermissions()) {
				throw new Error('WeatherGoat no longer has the required earthquake delivery permissions.');
			}

			const payload = earthquakeMessagePayload(
				request.event,
				request.distanceKm,
				request.eligible,
				request.action
			);

			request.assertCanDeliver();

			let messageId = delivery.messageId;
			if (request.action === 'edit') {
				if (!messageId) {
					throw new Error('Cannot edit an earthquake delivery without a confirmed Discord message ID.');
				}

				await channel.edit(messageId, payload);
			} else {
				await this.store.markCreateStarted(delivery.id, claimToken);
				createStarted = true;

				request.assertCanDeliver();

				const message = await channel.send(payload);
				messageId = message.id;
			}

			await this.store.markSent({
				deliveryId: delivery.id,
				claimToken,
				messageId,
				deliveredRevisionAt: request.event.updatedAt,
				lastEligible: request.eligible,
				deliveredAt: delivery.deliveredAt ?? this.clock()
			});

			return 'sent';
		} catch (error) {
			await this.store.markFailed({
				deliveryId: request.deliveryId,
				claimToken,
				state: createStarted ? 'AMBIGUOUS' : 'FAILED',
				failedAt: this.clock(),
				error: deliveryError(error)
			});

			throw error;
		}
	}
}
