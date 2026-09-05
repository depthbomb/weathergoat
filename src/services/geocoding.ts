import { env } from '@env';
import { HTTPRequestError } from '@errors';
import { BOT_USER_AGENT } from '@constants';
import { HTTPClient, HTTPService, parseRetryAfter } from './http';
import { RequestQueue } from './request-queue';
import { deserializeArray } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { NominatimFreeFormQuery } from '@models/NominatimFreeFormQuery';
import type { QueryObject } from '@depthbomb/common/url';

const nominatimQueue = new RequestQueue();
const CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 256;

export function createNominatimQuery(query: string, email: string): QueryObject {
	return {
		q: query.trim(),
		format: 'jsonv2',
		countrycodes: 'us',
		addressdetails: 1,
		email
	};
}

export async function deserializeNominatimResponse(res: Response) {
	HTTPRequestError.assert(res.ok, res.statusText, {
		code: res.status,
		status: res.statusText
	});

	return deserializeArray(NominatimFreeFormQuery, await res.json());
}

@injectable()
export class GeocodingService {
	private readonly client: HTTPClient;
	private readonly cache = new Map<string, { expiresAt: number; result: Promise<NominatimFreeFormQuery[]> }>();

	public constructor(
		private readonly http = inject(HTTPService),
		private readonly queue = nominatimQueue
	) {
		this.client = this.http.getClient('geocoding', {
			baseUrl: 'https://nominatim.openstreetmap.org/search',
			// Every outbound attempt must pass through the shared provider queue.
			retry: false,
			headers: {
				'User-Agent': BOT_USER_AGENT
			}
		});
	}

	public async queryLocationInfo(query: string) {
		const key = query.trim().toLowerCase();
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.result;
		this.cache.delete(key);
		const result = this.queue.run(async () => {
			const res = await this.client.get({
				query: createNominatimQuery(query, env.get('OWNER_EMAIL'))
			});
			const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
			if (retryAfter !== undefined) this.queue.defer(retryAfter);
			return deserializeNominatimResponse(res);
		}).catch(error => {
			if (this.cache.get(key)?.result === result) this.cache.delete(key);
			throw error;
		});
		this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
		while (this.cache.size > MAX_CACHE_ENTRIES) {
			this.cache.delete(this.cache.keys().next().value!);
		}

		return result;
	}
}
