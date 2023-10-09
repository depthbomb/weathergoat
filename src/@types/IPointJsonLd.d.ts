export interface IPointJsonLd {
	gridX:    number;
	gridY:    number;
	forecast: string;
	forecastHourly:      string;
	forecastGridData:    string;
	observationStations: string;
	relativeLocation: {
		city: string;
		state: string;
		geometry: string;
	};
	forecastZone:    string;
	county?:         string;
	fireWeatherZone: string;
	timeZone:        string;
	radarStation:    string;
}
