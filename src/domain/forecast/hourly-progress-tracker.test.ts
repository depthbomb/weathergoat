import { test, expect, describe } from 'bun:test';
import { HourlyProgressTracker } from './hourly-progress-tracker';

describe('hourly progress tracking', () => {
	test('retries only incomplete work during the same hour', () => {
		const tracker = new HourlyProgressTracker<number>();
		const now     = new Date('2026-08-15T12:00:00Z');

		expect(tracker.begin(now)).toBeTrue();
		tracker.markCompleted(1);
		expect(tracker.finish([1, 2])).toBeFalse();

		expect(tracker.begin(new Date('2026-08-15T12:30:00Z'))).toBeTrue();
		expect(tracker.hasCompleted(1)).toBeTrue();
		expect(tracker.hasCompleted(2)).toBeFalse();

		tracker.markCompleted(2);
		expect(tracker.finish([1, 2])).toBeTrue();
		expect(tracker.begin(new Date('2026-08-15T12:45:00Z'))).toBeFalse();
	});

	test('resets completed work at the next epoch hour', () => {
		const tracker = new HourlyProgressTracker<number>();

		tracker.begin(new Date('2026-11-01T06:30:00Z'));
		tracker.markCompleted(1);
		tracker.finish([1]);

		expect(tracker.begin(new Date('2026-11-01T07:00:00Z'))).toBeTrue();
		expect(tracker.hasCompleted(1)).toBeFalse();
	});
});
