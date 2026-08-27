import { test, expect, describe } from 'bun:test';
import {
	earthquakeDistanceKm,
	parseEarthquakeFeature,
	buildEarthquakeDetailURL,
	buildNearbyEarthquakeURL,
	buildRecentEarthquakeURL,
	isEarthquakeWithinRadius,
	parseEarthquakeCollection,
	EarthquakeUnavailableError,
	EarthquakeStaleResponseError,
	validateEarthquakeCoordinates,
	EarthquakeInvalidResponseError,
	parseEarthquakeFeatureResponse,
	parseEarthquakeCollectionResponse
} from './earthquakes';

const FIXTURE_ROOT = new URL('../fixtures/earthquakes/', import.meta.url);
const GENERATED_AT = new Date(1_787_860_252_000);

async function fixture(name: string): Promise<unknown> {
	return Bun.file(new URL(name, FIXTURE_ROOT)).json();
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
	const headers = new Headers(init.headers);
	if (!headers.has('content-type')) {
		headers.set('content-type', 'application/json; charset=utf-8');
	}

	return new Response(JSON.stringify(value), { ...init, headers });
}

describe('USGS GeoJSON parsing', () => {
	test('parses a current collection and selected bounded product metadata', async () => {
		const parsed = parseEarthquakeCollection(await fixture('current.json'), {
			now: GENERATED_AT,
			staleAfterMs: 60_000
		});

		expect(parsed.generatedAt).toEqual(GENERATED_AT);
		expect(parsed.events).toHaveLength(1);
		expect(parsed.events[0]).toMatchObject({
			id: 'test1000',
			magnitude: 4.2,
			magnitudeType: 'mw',
			reviewStatus: 'automatic',
			sourceStatus: 'automatic',
			significance: 280,
			feltReports: 12,
			tsunamiFlag: false,
			coordinates: { longitude: -122.2, latitude: 37.7, depthKm: 8.1 }
		});
		expect(parsed.events[0]?.products).toHaveLength(1);
		expect(parsed.events[0]?.products[0]).toMatchObject({
			type: 'origin',
			code: 'test1000',
			source: 'us',
			preferredWeight: 158
		});
		expect(parsed.events[0]?.products[0]?.contents[0]).toMatchObject({
			path: 'contents.xml',
			contentType: 'application/xml',
			length: 1234
		});
	});

	test('distinguishes a valid empty collection from provider failure', async () => {
		const parsed = parseEarthquakeCollection(await fixture('empty.json'), { now: GENERATED_AT });

		expect(parsed.events).toEqual([]);
	});

	test('accepts nullable magnitude and other partial optional fields', async () => {
		const parsed = parseEarthquakeFeature(await fixture('null-magnitude.json'));

		expect(parsed.magnitude).toBeNull();
		expect(parsed.magnitudeType).toBeNull();
		expect(parsed.place).toBeNull();
		expect(parsed.feltReports).toBeNull();
	});

	test('retains unknown provider values without treating them as known enum members', async () => {
		const parsed = parseEarthquakeFeature(await fixture('unknown-values.json'));

		expect(parsed.reviewStatus).toBe('unknown');
		expect(parsed.sourceStatus).toBe('machine-reprocessed-v2');
		expect(parsed.magnitudeType).toBe('future-scale');
		expect(parsed.eventType).toBe('experimental-event-kind');
		expect(parsed.tsunamiFlag).toBeNull();
	});

	test('preserves native identity while distinguishing a later revision', async () => {
		const current = parseEarthquakeCollection(await fixture('current.json'), { now: GENERATED_AT }).events[0]!;
		const revised = parseEarthquakeFeature(await fixture('revised.json'));

		expect(revised.id).toBe(current.id);
		expect(revised.updatedAt.getTime()).toBeGreaterThan(current.updatedAt.getTime());
		expect(revised.magnitude).toBe(4.6);
		expect(revised.reviewStatus).toBe('reviewed');
	});

	test('preserves a provider deletion status', async () => {
		const parsed = parseEarthquakeFeature(await fixture('deleted.json'));

		expect(parsed.id).toBe('test-deleted');
		expect(parsed.reviewStatus).toBe('deleted');
	});

	test('rejects malformed coordinate order and range', async () => {
		const malformed = await fixture('malformed.json');

		expect(() => parseEarthquakeCollection(malformed, { now: GENERATED_AT }))
			.toThrow(EarthquakeInvalidResponseError);
	});

	test('reports stale data separately from invalid and unavailable data', async () => {
		const current = await fixture('current.json');

		expect(() => parseEarthquakeCollection(current, {
			now: new Date(GENERATED_AT.getTime() + 60_001),
			staleAfterMs: 60_000
		})).toThrow(EarthquakeStaleResponseError);
	});

	test('rejects implausible provider clock skew', async () => {
		const current = await fixture('current.json');

		expect(() => parseEarthquakeCollection(current, {
			now: new Date(GENERATED_AT.getTime() - 60_001),
			maxFutureSkewMs: 60_000
		})).toThrow(EarthquakeInvalidResponseError);
	});
});

describe('USGS response boundaries', () => {
	test('validates response media type and JSON shape independently of transport', async () => {
		const current = await fixture('current.json');
		const parsed = await parseEarthquakeCollectionResponse(jsonResponse(current), { now: GENERATED_AT });

		expect(parsed.events[0]?.id).toBe('test1000');
		await expect(parseEarthquakeFeatureResponse(new Response('{}', {
			headers: { 'content-type': 'text/html' }
		}))).rejects.toBeInstanceOf(EarthquakeInvalidResponseError);
	});

	test('rejects declared and streamed bodies over the configured limit', async () => {
		const declared = new Response('{}', {
			headers: {
				'content-type': 'application/json',
				'content-length': '100'
			}
		});
		await expect(parseEarthquakeFeatureResponse(declared, { maxBytes: 10 }))
			.rejects.toBeInstanceOf(EarthquakeInvalidResponseError);

		const streamed = jsonResponse({ value: 'x'.repeat(100) });
		await expect(parseEarthquakeFeatureResponse(streamed, { maxBytes: 20 }))
			.rejects.toBeInstanceOf(EarthquakeInvalidResponseError);
	});

	test('reports HTTP failures as unavailable instead of an empty collection', async () => {
		const response = new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });

		await expect(parseEarthquakeCollectionResponse(response)).rejects.toBeInstanceOf(EarthquakeUnavailableError);
	});
});

describe('FDSN query construction', () => {
	test('constructs a bounded recent earthquake query', () => {
		const url = buildRecentEarthquakeURL({
			startTime: new Date('2026-08-26T00:00:00.000Z'),
			endTime: new Date('2026-08-27T00:00:00.000Z'),
			minMagnitude: 2.5,
			limit: 25
		});

		expect(url.origin).toBe('https://earthquake.usgs.gov');
		expect(url.pathname).toBe('/fdsnws/event/1/query');
		expect(url.searchParams.get('format')).toBe('geojson');
		expect(url.searchParams.get('eventtype')).toBe('earthquake');
		expect(url.searchParams.get('orderby')).toBe('time');
		expect(url.searchParams.get('minmagnitude')).toBe('2.5');
		expect(url.searchParams.get('limit')).toBe('25');
	});

	test('constructs a global circle query and rejects invalid bounds', () => {
		const url = buildNearbyEarthquakeURL({
			latitude: 80,
			longitude: 179.9,
			radiusKm: 250,
			limit: 10
		});

		expect(url.searchParams.get('latitude')).toBe('80');
		expect(url.searchParams.get('longitude')).toBe('179.9');
		expect(url.searchParams.get('maxradiuskm')).toBe('250');
		expect(() => buildNearbyEarthquakeURL({ latitude: 91, longitude: 0, radiusKm: 10 })).toThrow(RangeError);
		expect(() => buildNearbyEarthquakeURL({ latitude: 0, longitude: 0, radiusKm: 0 })).toThrow(RangeError);
		expect(() => buildRecentEarthquakeURL({ limit: 201 })).toThrow(RangeError);
	});

	test('constructs an event detail query without accepting query injection', () => {
		const url = buildEarthquakeDetailURL('us7000abcd');

		expect(url.searchParams.get('eventid')).toBe('us7000abcd');
		expect(() => buildEarthquakeDetailURL('event&includedeleted=true')).toThrow(RangeError);
	});
});

describe('great-circle earthquake distance', () => {
	test('handles antimeridian and polar distances', () => {
		const antimeridian = earthquakeDistanceKm(
			{ latitude: 0, longitude: 179.9, depthKm: 0 },
			{ latitude: 0, longitude: -179.9, depthKm: 0 }
		);
		const polar = earthquakeDistanceKm(
			{ latitude: 89, longitude: 0, depthKm: 0 },
			{ latitude: 89, longitude: 90, depthKm: 0 }
		);

		expect(antimeridian).toBeCloseTo(22.239, 2);
		expect(polar).toBeCloseTo(157.25, 1);
	});

	test('includes the exact radius boundary and excludes a smaller radius', () => {
		const from = { latitude: 0, longitude: 0, depthKm: 0 };
		const to = { latitude: 0, longitude: 1, depthKm: 0 };
		const boundary = earthquakeDistanceKm(from, to);

		expect(isEarthquakeWithinRadius(from, to, boundary)).toBeTrue();
		expect(isEarthquakeWithinRadius(from, to, boundary - 0.001)).toBeFalse();
		expect(isEarthquakeWithinRadius(from, from, 0)).toBeTrue();
	});

	test('rejects invalid coordinate and radius values', () => {
		expect(() => validateEarthquakeCoordinates(-91, 0)).toThrow(RangeError);
		expect(() => validateEarthquakeCoordinates(0, 181)).toThrow(RangeError);
		expect(() => validateEarthquakeCoordinates(0, 0, Number.NaN)).toThrow(RangeError);
		expect(() => isEarthquakeWithinRadius(
			{ latitude: 0, longitude: 0, depthKm: 0 },
			{ latitude: 0, longitude: 0, depthKm: 0 },
			-1
		)).toThrow(RangeError);
	});
});
