import { test, expect, describe } from 'bun:test';
import { EarthquakeCommand, earthquakeProviderErrorMessage } from './earthquake';
import {
	EarthquakeUnavailableError,
	EarthquakeStaleResponseError,
	EarthquakeInvalidResponseError
} from '@services/earthquakes';
import type { GeocodingService } from '@services/geocoding';
import type { EarthquakeService } from '@services/earthquakes';

function commandData() {
	const earthquakes = {} as EarthquakeService;
	const geocoding = {} as GeocodingService;

	return new EarthquakeCommand(earthquakes, geocoding).data.toJSON();
}

describe('/earthquake command contract', () => {
	test('exposes one discoverable family with all required workflows', () => {
		const data = commandData();
		const names = data.options?.map(option => option.name);

		expect(data.name).toBe('earthquake');
		expect(names).toEqual([
			'recent',
			'nearby',
			'detail',
			'subscribe',
			'subscriptions',
			'unsubscribe'
		]);
	});

	test('publishes bounded lookup and subscription inputs to Discord', () => {
		const data = commandData();
		const nearby = data.options?.find(option => option.name === 'nearby');
		const subscribe = data.options?.find(option => option.name === 'subscribe');
		const nearbyRadius = nearby && 'options' in nearby
			? nearby.options?.find(option => option.name === 'radius')
			: undefined;
		const hours = nearby && 'options' in nearby
			? nearby.options?.find(option => option.name === 'hours')
			: undefined;
		const results = nearby && 'options' in nearby
			? nearby.options?.find(option => option.name === 'results')
			: undefined;
		const magnitude = subscribe && 'options' in subscribe
			? subscribe.options?.find(option => option.name === 'minimum-magnitude')
			: undefined;

		expect(nearbyRadius).toMatchObject({ min_value: 1, max_value: 2_000 });
		expect(hours).toMatchObject({ min_value: 1, max_value: 720 });
		expect(results).toMatchObject({ min_value: 1, max_value: 10 });
		expect(magnitude).toMatchObject({ min_value: -1, max_value: 10 });
	});
});

describe('earthquake provider errors', () => {
	test('distinguishes missing detail, unavailable, invalid, and stale responses', () => {
		expect(earthquakeProviderErrorMessage(new EarthquakeUnavailableError('missing', 404), true))
			.toContain('No USGS earthquake');
		expect(earthquakeProviderErrorMessage(new EarthquakeUnavailableError('missing', 204), true))
			.toContain('No USGS earthquake');
		expect(earthquakeProviderErrorMessage(new EarthquakeUnavailableError('down', 503)))
			.toContain('unavailable');
		expect(earthquakeProviderErrorMessage(new EarthquakeInvalidResponseError('bad')))
			.toContain('safely read');
		expect(earthquakeProviderErrorMessage(new EarthquakeStaleResponseError('old', new Date(0), 1)))
			.toContain('stale');
	});
});
