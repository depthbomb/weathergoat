import { httpService } from './http';
import { locationService } from './location';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/gridpoint-forecast';
import type { IService } from '@services';
import type { GridpointForecastPeriod } from '@models/gridpoint-forecast-period';

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
	name: 'Forecast',

	[kHttpClient]: httpService.getClient('forecasts', { retry: true }),

	async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await locationService.getInfoFromCoordinates(latitude, longitude);
		const res  = await this[kHttpClient].get(info.forecastUrl);
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
});
