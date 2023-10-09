export interface IGridpointForecastPeriod {
	number:           number;
	name:             string;
	startTime:        Date;
	endTime:          Date;
	isDayTime:        boolean;
	icon:             string;
	shortForecast:    string;
	detailedForecast: string;
}
