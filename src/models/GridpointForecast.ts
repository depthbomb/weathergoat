import { Type } from 'class-transformer';
import { GridpointForecastPeriod } from '@models/GridpointForecastPeriod';

export class GridpointForecast {
	@Type(() => GridpointForecastPeriod)
	public periods!: GridpointForecastPeriod[];
}
