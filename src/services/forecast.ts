import { HttpService } from './http';
import { container } from '@container';
import { HTTPRequestError } from '@errors';
import { LocationService } from './location';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/GridpointForecast';
import type { HttpClient } from './http';

export class ForecastService {
	private readonly http: HttpClient;
	private readonly location: LocationService;

	public constructor() {
		const httpService = container.resolve(HttpService);

		this.http     = httpService.getClient('forecasts');
		this.location = container.resolve(LocationService);
	}

	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 *
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	public async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await this.location.getInfoFromCoordinates(latitude, longitude);
		const res  = await this.http.get(info.forecastUrl);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
}
