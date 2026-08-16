import { HTTPService } from './http';
import { RedisService } from './redis';
import { HTTPRequestError } from '@errors';
import { LocationService } from './location';
import { test, expect, describe } from 'bun:test';

describe('location fallback probing', () => {
	test('caps fallback requests and disables retries for probes', async () => {
		let normalRequests = 0;
		let probeRequests  = 0;
		let activeProbes   = 0;
		let maxConcurrency = 0;
		const clientOptions = new Map<string, { retry?: boolean }>();
		const http = {
			getClient(name: string, options: { retry?: boolean }) {
				clientOptions.set(name, options);

				return {
					async get() {
						if (name === 'location') {
							normalRequests++;
							return new Response(null, { status: 404, statusText: 'Not Found' });
						}

						probeRequests++;
						activeProbes++;
						maxConcurrency = Math.max(maxConcurrency, activeProbes);
						await new Promise(resolve => setTimeout(resolve, 1));
						activeProbes--;

						return new Response(null, { status: 404, statusText: 'Not Found' });
					}
				};
			}
		} as unknown as HTTPService;
		const redis = {
			get: async () => null,
			set: async () => undefined
		} as unknown as RedisService;
		const service = new LocationService(http, redis);

		await expect(service.resolveCoordinates('25', '-126')).rejects.toBeInstanceOf(HTTPRequestError);

		expect(normalRequests).toBe(1);
		expect(probeRequests).toBe(25);
		expect(maxConcurrency).toBeLessThanOrEqual(4);
		expect(clientOptions.get('location-probe')?.retry).toBeFalse();
	});
});
