import { logger } from '@logger';
import { makeRequest } from '@lib/http';
import { plainToClass } from 'class-transformer';
import { getCoordinateInfo } from '@lib/location';
import { GridpointForecast } from '@models/gridpoint-forecast';
import { GridpointForecastPeriod } from '@models/gridpoint-forecast-period';

export async function getForecastForCoordinates(lat: number, lon: number): Promise<GridpointForecastPeriod> {
	logger.debug('Retrieving forecast', { lat, lon });

	const locationInfo = await getCoordinateInfo(lat, lon);
	const res          = await makeRequest(locationInfo.forecastUrl);
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const gpfc = plainToClass(GridpointForecast, json);

	return gpfc.periods[0];
}
