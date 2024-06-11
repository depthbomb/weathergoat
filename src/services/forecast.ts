import { httpService } from './http';
import { locationService } from './location';
import { HTTPRequestError } from '@lib/errors';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/GridpointForecast';
import type { IService } from '@services';
import type { GridpointForecastPeriod } from '@models/GridpointForecastPeriod';

interface IForecastService extends IService {
	/**
	 * @internal
	 */
	[kHttpClient]: ReturnType<typeof httpService.getClient>;
	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	getForecastForCoordinates(latitude: string, longitude: string): Promise<GridpointForecastPeriod>;
}

const kHttpClient = Symbol('http-client');

export const forecastService: IForecastService = ({
	name: 'com.weathergoat.services.Forecasts',

	[kHttpClient]: httpService.getClient('forecasts', { retry: true }),

	async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await locationService.getInfoFromCoordinates(latitude, longitude);
		const res  = await this[kHttpClient].get(info.forecastUrl);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
});
