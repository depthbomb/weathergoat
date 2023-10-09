import { logger } from '@logger';
import { nwsClient } from '@lib/nwsClient';
import { getCoordinateInfo } from '@lib/location';
import type { IGridPointForecastJsonLd } from '#IGridPointForecastJsonLd';
import type { IGridpointForecastPeriod } from '#IGridpointForecastPeriod';

export async function getForecastForCoordinates(lat: number, lon: number): Promise<IGridpointForecastPeriod> {
	logger.debug('Retrieving forecast', { lat, lon });

	const locationInfo = await getCoordinateInfo(lat, lon);
	const data         = await nwsClient<IGridPointForecastJsonLd>(locationInfo.forecastUrl);
	const forecast     = data.periods[0]!;

	return forecast;
}
