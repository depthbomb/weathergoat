import { env } from '@env';
import { BOT_USER_AGENT } from '@constants';
import { HTTPClient, HTTPService } from './http';
import { deserializeArray } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { NominatimFreeFormQuery } from '@models/NominatimFreeFormQuery';

@injectable()
export class GeocodingService {
	private readonly client: HTTPClient;

	public constructor(
		private readonly http = inject(HTTPService)
	) {
		this.client = this.http.getClient('geocoding', {
			baseUrl: 'https://nominatim.openstreetmap.org/search?q={query}&format=jsonv2&countrycodes=us&addressdetails=1&email={email}',
			tokens: {
				email: env.get('OWNER_EMAIL')
			},
			headers: {
				'User-Agent': BOT_USER_AGENT
			}
		});
	}

	public async queryLocationInfo(query: string) {
		query = query.trim();

		const res = await this.client.get({
			tokens: {
				query
			}
		});

		const json = await res.json();

		return deserializeArray(NominatimFreeFormQuery, json);
	}
}
