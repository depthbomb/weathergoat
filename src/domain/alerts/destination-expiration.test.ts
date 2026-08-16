import { test, expect } from 'bun:test';
import { resolveDestinationExpiration } from './destination-expiration';

const now = new Date('2026-08-15T12:00:00.000Z');

test('alert destinations do not expire by default', () => {
	expect(resolveDestinationExpiration(null, now)).toBeNull();
});

test.each([
	['24h', '2026-08-16T12:00:00.000Z'],
	['3d',  '2026-08-18T12:00:00.000Z'],
	['1w',  '2026-08-22T12:00:00.000Z'],
	['1mo', '2026-09-15T12:00:00.000Z']
])('resolves the %s alert destination expiration', (value, expected) => {
	expect(resolveDestinationExpiration(value, now)?.toISOString()).toBe(expected);
});

test('rejects unsupported alert destination expirations', () => {
	expect(() => resolveDestinationExpiration('forever', now)).toThrow(RangeError);
});
