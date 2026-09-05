import { HTTPRequestError } from '@errors';
import { URLPath } from '@depthbomb/common/url';
import { test, expect, describe } from 'bun:test';
import { GeocodingService, createNominatimQuery, deserializeNominatimResponse } from './geocoding';
import { RequestQueue } from './request-queue';
import type { HTTPService } from './http';

describe('geocoding requests', () => {
	test('coalesces requests and retries failed lookups through the queue', async () => {
		let calls = 0;
		const http = { getClient: (_name: string, options: { retry: boolean }) => {
			expect(options.retry).toBeFalse();
			return { get: async () => {
				calls++;
				if (calls === 1) throw new Error('temporary failure');
				return Response.json([]);
			} };
		} } as unknown as HTTPService;
		const service = new GeocodingService(http, new RequestQueue(0));
		await expect(service.queryLocationInfo('Austin')).rejects.toThrow('temporary failure');
		expect(await Promise.all([service.queryLocationInfo('Austin'), service.queryLocationInfo(' austin ')])).toEqual([[], []]);
		await service.queryLocationInfo('Austin');
		expect(calls).toBe(2);
	});

	test('encodes user input and contact email as individual query parameters', () => {
		const query = createNominatimQuery(' Austin & format=xml#fragment ', 'weather+bot@example.com');
		const url   = URLPath.from('https://nominatim.openstreetmap.org/search').withQuery(query).toURL();

		expect(url.searchParams.get('q')).toBe('Austin & format=xml#fragment');
		expect(url.searchParams.get('email')).toBe('weather+bot@example.com');
		expect(url.searchParams.getAll('format')).toEqual(['jsonv2']);
		expect(url.hash).toBe('');
	});

	test('rejects unsuccessful responses before parsing the body', async () => {
		const response = new Response('<html>rate limited</html>', {
			status: 429,
			statusText: 'Too Many Requests'
		});

		await expect(deserializeNominatimResponse(response)).rejects.toBeInstanceOf(HTTPRequestError);
	});

	test('accepts results whose address omits optional administrative fields', async () => {
		const response = Response.json([{
			place_id: 1,
			licence: 'OpenStreetMap contributors',
			lat: '30.2672',
			lon: '-97.7431',
			display_name: 'Austin, Texas',
			address: { city: 'Austin' }
		}]);

		const [location] = await deserializeNominatimResponse(response);

		expect(location.address?.city).toBe('Austin');
		expect(location.address?.county).toBeUndefined();
		expect(location.address?.state).toBeUndefined();
	});
});
