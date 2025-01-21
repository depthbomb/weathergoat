import { container } from '@container';
import { HTTPRequestError } from '@errors';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/GridpointForecast';
import type { HttpClient } from './http';
import type { IService } from '@services';
import type { ILocationService } from './location';
import type { GridpointForecastPeriod } from '@models/GridpointForecastPeriod';

export interface IForecastService extends IService {
	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 *
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	getForecastForCoordinates(latitude: string, longitude: string): Promise<GridpointForecastPeriod>;
}

export default class ForecastService implements IForecastService {
	private readonly http: HttpClient;
	private readonly location: ILocationService;

	public constructor() {
		const httpService = container.resolve('Http');

		this.http     = httpService.getClient('forecasts');
		this.location = container.resolve('Location');
	}

	public async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await this.location.getInfoFromCoordinates(latitude, longitude);
		const res  = await this.http.get(info.forecastUrl);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
}
