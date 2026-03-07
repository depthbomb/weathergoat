import { Serializable, JSONProperty } from '@depthbomb/serde';
import { GridpointForecastPeriod } from '@models/GridpointForecastPeriod';

@Serializable()
export class GridpointForecast {
	@JSONProperty({ type: () => GridpointForecastPeriod, isArray: true })
	public periods!: GridpointForecastPeriod[];
}
