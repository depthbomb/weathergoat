import { test, expect, describe } from 'bun:test';
import { isEarthquakeEligible, determineDeliveryAction } from './delivery-policy';

describe('earthquake subscription eligibility', () => {
	test('includes magnitude and radius boundaries', () => {
		expect(isEarthquakeEligible(
			{ magnitude: 4.5, distanceKm: 100 },
			{ minimumMagnitude: 4.5, radiusKm: 100 }
		)).toBeTrue();
	});

	test('rejects null magnitudes and values outside either threshold', () => {
		const criteria = { minimumMagnitude: 4.5, radiusKm: 100 };

		expect(isEarthquakeEligible({ magnitude: null, distanceKm: 10 }, criteria)).toBeFalse();
		expect(isEarthquakeEligible({ magnitude: 4.49, distanceKm: 10 }, criteria)).toBeFalse();
		expect(isEarthquakeEligible({ magnitude: 5, distanceKm: 100.01 }, criteria)).toBeFalse();
	});
});

describe('earthquake delivery revision policy', () => {
	const revision = new Date('2026-08-27T19:00:00Z');

	test('never publishes an initial baseline', () => {
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: true,
			isEligible: true,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('none');
	});

	test('creates the first delivery when an event becomes eligible', () => {
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: true,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('create');
	});

	test('does not create a delivery for an ineligible revision', () => {
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: false,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('none');
	});

	test('edits an existing delivery for every later revision even if no longer eligible', () => {
		expect(determineDeliveryAction({
			hasDelivery: true,
			isBaseline: false,
			isEligible: false,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: new Date('2026-08-27T18:00:00Z')
		})).toBe('edit');
	});

	test('suppresses unchanged and replayed revisions', () => {
		for (const sourceUpdatedAt of [revision, new Date('2026-08-27T18:00:00Z')]) {
			expect(determineDeliveryAction({
				hasDelivery: true,
				isBaseline: false,
				isEligible: true,
				sourceUpdatedAt,
				deliveredRevisionAt: revision
			})).toBe('none');
		}
	});

	test('creates after an upward magnitude crossing and edits after a downward revision', () => {
		const criteria = { minimumMagnitude: 4.5, radiusKm: 100 };
		const initialEligible = isEarthquakeEligible({ magnitude: 4.4, distanceKm: 50 }, criteria);
		const revisedEligible = isEarthquakeEligible({ magnitude: 4.5, distanceKm: 50 }, criteria);

		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: initialEligible,
			sourceUpdatedAt: new Date('2026-08-27T18:00:00Z'),
			deliveredRevisionAt: null
		})).toBe('none');
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: revisedEligible,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('create');
		expect(determineDeliveryAction({
			hasDelivery: true,
			isBaseline: false,
			isEligible: false,
			sourceUpdatedAt: new Date('2026-08-27T20:00:00Z'),
			deliveredRevisionAt: revision
		})).toBe('edit');
	});

	test('retries a create after a preflight failure that never attempted Discord publication', () => {
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: true,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('create');
	});

	test('handles movement into and out of radius without duplicate creation', () => {
		const criteria = { minimumMagnitude: 3, radiusKm: 100 };
		const outside = isEarthquakeEligible({ magnitude: 4, distanceKm: 100.1 }, criteria);
		const inside = isEarthquakeEligible({ magnitude: 4, distanceKm: 99.9 }, criteria);

		expect(outside).toBeFalse();
		expect(inside).toBeTrue();
		expect(determineDeliveryAction({
			hasDelivery: false,
			isBaseline: false,
			isEligible: inside,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: null
		})).toBe('create');
		expect(determineDeliveryAction({
			hasDelivery: true,
			isBaseline: false,
			isEligible: outside,
			sourceUpdatedAt: new Date('2026-08-27T20:00:00Z'),
			deliveredRevisionAt: revision
		})).toBe('edit');
	});

	test('uses persisted delivery revision state after a bot restart', () => {
		expect(determineDeliveryAction({
			hasDelivery: true,
			isBaseline: false,
			isEligible: true,
			sourceUpdatedAt: revision,
			deliveredRevisionAt: revision
		})).toBe('none');
		expect(determineDeliveryAction({
			hasDelivery: true,
			isBaseline: false,
			isEligible: true,
			sourceUpdatedAt: new Date('2026-08-27T20:00:00Z'),
			deliveredRevisionAt: revision
		})).toBe('edit');
	});
});
