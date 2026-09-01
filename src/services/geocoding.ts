import { env } from '@env';
import { HTTPRequestError } from '@errors';
import { BOT_USER_AGENT } from '@constants';
import { HTTPClient, HTTPService } from './http';
import { deserializeArray } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { NominatimFreeFormQuery } from '@models/NominatimFreeFormQuery';
import type { QueryObject } from '@depthbomb/common/url';

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

	public constructor(
		private readonly http = inject(HTTPService)
	) {
		this.client = this.http.getClient('geocoding', {
			baseUrl: 'https://nominatim.openstreetmap.org/search',
			headers: {
				'User-Agent': BOT_USER_AGENT
			}
		});
	}

	public async queryLocationInfo(query: string) {
		const res = await this.client.get({
			query: createNominatimQuery(query, env.get('OWNER_EMAIL'))
		});

		return deserializeNominatimResponse(res);
	}
}
