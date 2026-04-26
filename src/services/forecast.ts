import { HTTPService } from './http';
import { logger } from '@lib/logger';
import { HTTPRequestError } from '@errors';
import { LocationService } from './location';
import { deserialize } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { GridpointForecast } from '@models/GridpointForecast';
import type { HTTPClient } from './http';
import type { LogLayer } from 'loglayer';

@injectable()
export class ForecastService {
	private readonly logger: LogLayer;
	private readonly client: HTTPClient;

	public constructor(
		private readonly http     = inject(HTTPService),
		private readonly location = inject(LocationService)
	) {
		this.logger = logger.child().withPrefix(ForecastService.name.bracketWrap());
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
		const location = await this.location.getLocation(latitude, longitude);
		const res      = await this.client.get(location.forecastUrl);
		if (!res.ok) {
			if (res.status === 503) {
				this.logger
					.withMetadata({ latitude, longitude })
					.warn('Unable to retrieve forecast for coordinates, upstream API unavailable.');
				return;
			}

			throw new HTTPRequestError(res.statusText, { code: res.status, status: res.statusText });
		}

		const json = await res.json();
		const data = deserialize(GridpointForecast, json);

		return data.periods[0];
	}
}
