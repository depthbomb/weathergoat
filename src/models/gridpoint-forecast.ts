import { Type } from 'class-transformer';
import { GridpointForecastPeriod } from './gridpoint-forecast-period';

export class GridpointForecast {
	@Type(() => GridpointForecastPeriod)
	public periods!: GridpointForecastPeriod[];
}
