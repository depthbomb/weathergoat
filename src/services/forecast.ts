import { HttpService } from './http';
import { LocationService } from './location';
import { HTTPRequestError } from '@lib/errors';
import { plainToClass } from 'class-transformer';
import { inject, injectable } from '@needle-di/core';
import { GridpointForecast } from '@models/GridpointForecast';
import type { HttpClient } from './http';

@injectable()
export class ForecastService {
	private readonly client: HttpClient;

	public constructor(
		private readonly httpService = inject(HttpService),
		private readonly location    = inject(LocationService)
	) {

		this.client = this.httpService.getClient('forecasts');
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
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
}
