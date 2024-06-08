import { httpService } from './http';
import { defineService } from '@services';
import { locationService } from './location';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/gridpoint-forecast';
import type { GridpointForecastPeriod } from '@models/gridpoint-forecast-period';

interface IForecastService {
	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	getForecastForCoordinates(latitude: string, longitude: string): Promise<GridpointForecastPeriod>;
}

export const forecastService = defineService<IForecastService>('Forecast', () => {
	const http = httpService.getClient('forecasts', { retry: true });

	async function getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await locationService.getInfoFromCoordinates(latitude, longitude);
		const res  = await http.get(info.forecastUrl);
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}

	return { getForecastForCoordinates };
});
