import { test, expect, describe } from 'bun:test';
import { EarthquakeDeliveryProcessor } from './delivery-processor';
import type { EarthquakeEvent } from '@models/Earthquake';
import type {
	EarthquakeDeliveryClaim,
	EarthquakeDeliveryStore,
	EarthquakeDeliveryRecord,
	EarthquakeDeliveryChannel,
	EarthquakeDeliveryDiscord,
	EarthquakeDeliveryFailure,
	EarthquakeDeliverySuccess
} from './delivery-processor';

const NOW = new Date('2026-08-27T20:00:00.000Z');
const REVISION = new Date('2026-08-27T19:00:00.000Z');

function earthquake(updatedAt = REVISION): EarthquakeEvent {
	return {
		id: 'us-test',
		updatedAt,
		occurredAt: new Date('2026-08-27T18:00:00.000Z'),
		coordinates: { latitude: 35, longitude: -97, depthKm: 8 },
		magnitude: 4.5,
		magnitudeType: 'mw',
		place: 'Test event',
		url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-test',
		detailUrl: null,
		reviewStatus: 'reviewed',
		sourceStatus: 'reviewed',
		eventType: 'earthquake',
		significance: 312,
		feltReports: 4,
		tsunamiFlag: false,
		products: []
	};
}

class MemoryStore implements EarthquakeDeliveryStore {
	public record: EarthquakeDeliveryRecord = {
		id: 1,
		channelId: 'channel-1',
		messageId: null,
		deliveredAt: null
	};
	public claimToken: string | null = null;
	public claimExpiresAt: Date | null = null;
	public deliveredRevisionAt: Date | null = null;
	public state: 'PENDING' | 'AMBIGUOUS' | 'FAILED' | 'SENT' = 'PENDING';
	public attemptCount = 0;
	public failure: EarthquakeDeliveryFailure | null = null;

	public async claim(input: EarthquakeDeliveryClaim) {
		const activeClaim = this.claimToken !== null
			&& this.claimExpiresAt !== null
			&& this.claimExpiresAt >= input.now;
		const actionNeeded = input.action === 'create'
			? this.record.messageId === null && this.deliveredRevisionAt === null && this.state === 'PENDING'
			: this.deliveredRevisionAt === null || this.deliveredRevisionAt < input.sourceUpdatedAt;
		if (activeClaim || !actionNeeded) {
			return false;
		}

		this.claimToken = input.claimToken;
		this.claimExpiresAt = input.claimExpiresAt;

		return true;
	}

	public async getClaimed(deliveryId: number, claimToken: string) {
		if (deliveryId !== this.record.id || claimToken !== this.claimToken) {
			throw new Error('Delivery claim was lost.');
		}

		return { ...this.record };
	}

	public async markCreateStarted(deliveryId: number, claimToken: string) {
		this.assertClaim(deliveryId, claimToken);
		this.state = 'AMBIGUOUS';
		this.attemptCount++;
	}

	public async markSent(input: EarthquakeDeliverySuccess) {
		this.assertClaim(input.deliveryId, input.claimToken);
		this.record.messageId = input.messageId;
		this.record.deliveredAt = input.deliveredAt;
		this.deliveredRevisionAt = input.deliveredRevisionAt;
		this.state = 'SENT';
		this.failure = null;
		this.releaseClaim();
	}

	public async markFailed(input: EarthquakeDeliveryFailure) {
		this.assertClaim(input.deliveryId, input.claimToken);
		this.state = input.state;
		this.failure = input;
		this.releaseClaim();
	}

	private assertClaim(deliveryId: number, claimToken: string) {
		if (deliveryId !== this.record.id || claimToken !== this.claimToken) {
			throw new Error('Delivery claim was lost.');
		}
	}

	private releaseClaim() {
		this.claimToken = null;
		this.claimExpiresAt = null;
	}
}

type FakeChannel = EarthquakeDeliveryChannel & {
	sends: unknown[];
	edits: Array<{ messageId: string; payload: unknown }>;
};

function channel(options: { permissions?: boolean; sendError?: Error; editError?: Error } = {}): FakeChannel {
	const sends: unknown[] = [];
	const edits: Array<{ messageId: string; payload: unknown }> = [];

	return {
		sends,
		edits,
		hasRequiredPermissions: () => options.permissions ?? true,
		send: async payload => {
			sends.push(payload);
			if (options.sendError) {
				throw options.sendError;
			}

			return { id: 'message-1' };
		},
		edit: async (messageId, payload) => {
			edits.push({ messageId, payload });
			if (options.editError) {
				throw options.editError;
			}
		}
	};
}

function processor(store: MemoryStore, resolvedChannel: EarthquakeDeliveryChannel | null) {
	let token = 0;
	const discord: EarthquakeDeliveryDiscord = {
		getGuildTextChannel: async () => resolvedChannel
	};

	return new EarthquakeDeliveryProcessor({
		store,
		discord,
		clock: () => new Date(NOW),
		claimToken: () => `claim-${++token}`,
		claimTtlMs: 60_000
	});
}

function request(action: 'create' | 'edit', updatedAt = REVISION) {
	return {
		deliveryId: 1,
		event: earthquake(updatedAt),
		distanceKm: 25,
		eligible: true,
		action,
		assertCanDeliver: () => {}
	};
}

describe('earthquake delivery processor', () => {
	test('allows exactly one concurrent create claim winner', async () => {
		const store = new MemoryStore();
		const target = channel();
		const subject = processor(store, target);

		const results = await Promise.all([
			subject.deliver(request('create')),
			subject.deliver(request('create'))
		]);

		expect(results.sort()).toEqual(['not-claimed', 'sent']);
		expect(target.sends).toHaveLength(1);
		expect(store.attemptCount).toBe(1);
	});

	test('marks a missing or deleted channel as a safe failure before create starts', async () => {
		const store = new MemoryStore();

		await expect(processor(store, null).deliver(request('create'))).rejects.toThrow('channel is missing');

		expect(store.failure?.state).toBe('FAILED');
		expect(store.attemptCount).toBe(0);
	});

	test('marks lost channel permissions as a safe failure before create starts', async () => {
		const store = new MemoryStore();

		await expect(processor(store, channel({ permissions: false })).deliver(request('create')))
			.rejects.toThrow('required earthquake delivery permissions');

		expect(store.failure?.state).toBe('FAILED');
		expect(store.attemptCount).toBe(0);
	});

	test('marks a missing or deleted Discord message during edit as failed', async () => {
		const store = new MemoryStore();
		store.record.messageId = 'deleted-message';
		store.deliveredRevisionAt = new Date('2026-08-27T18:00:00.000Z');
		store.state = 'SENT';

		await expect(processor(store, channel({ editError: new Error('Unknown Message') })).deliver(request('edit')))
			.rejects.toThrow('Unknown Message');

		expect(store.failure?.state).toBe('FAILED');
		expect(store.failure?.error).toContain('Unknown Message');
	});

	test('creates once and edits the persisted message for a later revision', async () => {
		const store = new MemoryStore();
		const target = channel();
		const subject = processor(store, target);

		expect(await subject.deliver(request('create'))).toBe('sent');
		expect(store.record.messageId).toBe('message-1');
		expect(store.deliveredRevisionAt).toEqual(REVISION);

		const later = new Date('2026-08-27T20:30:00.000Z');
		expect(await processor(store, target).deliver(request('edit', later))).toBe('sent');
		expect(target.sends).toHaveLength(1);
		expect(target.edits).toHaveLength(1);
		expect(target.edits[0]?.messageId).toBe('message-1');
		expect(store.deliveredRevisionAt).toEqual(later);
	});

	test('distinguishes an uncertain create send from an edit failure', async () => {
		const createStore = new MemoryStore();
		await expect(processor(createStore, channel({ sendError: new Error('send outcome unknown') })).deliver(request('create')))
			.rejects.toThrow('send outcome unknown');
		expect(createStore.state).toBe('AMBIGUOUS');
		expect(createStore.attemptCount).toBe(1);
		expect(await processor(createStore, channel()).deliver(request('create'))).toBe('not-claimed');

		const editStore = new MemoryStore();
		editStore.record.messageId = 'message-1';
		editStore.deliveredRevisionAt = new Date('2026-08-27T18:00:00.000Z');
		editStore.state = 'SENT';
		await expect(processor(editStore, channel({ editError: new Error('edit failed') })).deliver(request('edit')))
			.rejects.toThrow('edit failed');
		expect(editStore.failure?.state).toBe('FAILED');
	});
});
