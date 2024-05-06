import { Type } from 'class-transformer';
import { GridpointForecastPeriod } from '@models/gridpoint-forecast-period';

export class GridpointForecast {
	@Type(() => GridpointForecastPeriod)
	public periods!: GridpointForecastPeriod[];
}
