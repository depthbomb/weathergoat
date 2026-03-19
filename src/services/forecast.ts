import { HTTPService } from './http';
import { HTTPRequestError } from '@errors';
import { LocationService } from './location';
import { deserialize } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { GridpointForecast } from '@models/GridpointForecast';
import type { HTTPClient } from './http';

@injectable()
export class ForecastService {
	private readonly client: HTTPClient;

	public constructor(
		private readonly http     = inject(HTTPService),
		private readonly location = inject(LocationService)
	) {

		this.client = this.http.getClient('forecasts', {
			headers: {
				Accept: 'application/ld+json'
			}
		});
	}

	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 *
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	public async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await this.location.getInfoFromCoordinates(latitude, longitude);
		const res  = await this.client.get(info.forecastUrl);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = deserialize(GridpointForecast, json);

		return data.periods[0];
	}
}
