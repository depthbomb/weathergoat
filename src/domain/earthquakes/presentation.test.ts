import { test, expect } from 'bun:test';
import { buildEarthquakeEmbed } from './presentation';
import type { EarthquakeEvent } from '@models/Earthquake';

const event: EarthquakeEvent = {
	id: 'us-test',
	updatedAt: new Date('2026-08-27T19:01:00Z'),
	occurredAt: new Date('2026-08-27T19:00:00Z'),
	coordinates: { latitude: 10, longitude: 179.9, depthKm: 12.34 },
	magnitude: 5.25,
	magnitudeType: 'mw',
	place: 'Test location',
	url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-test',
	detailUrl: null,
	reviewStatus: 'automatic',
	sourceStatus: 'automatic',
	eventType: 'earthquake',
	significance: 420,
	feltReports: 3,
	tsunamiFlag: true,
	products: []
};

test('earthquake embeds distinguish automatic solutions and tsunami metadata', () => {
	const json = buildEarthquakeEmbed(event, { distanceKm: 99.95 }).toJSON();
	const text = JSON.stringify(json);

	expect(text).toContain('Automatic USGS solution');
	expect(text).toContain('not a tsunami warning');
	expect(text).toContain('100 km');
	expect(json.url).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/us-test');
});

test('revision embeds retain a no-longer-eligible notice', () => {
	const json = buildEarthquakeEmbed(event, { stillEligible: false, revisionNotice: true }).toJSON();

	expect(JSON.stringify(json)).toContain('no longer meets');
	expect(json.description).toContain('revised');
});
