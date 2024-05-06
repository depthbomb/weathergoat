import { HttpClient } from '@lib/http';
import { plainToClass } from 'class-transformer';
import { getInfoFromCoordinates } from '@lib/location';
import { GridpointForecast } from '@models/gridpoint-forecast';

const http = new HttpClient({ retry: true });

export async function getForecastForCoordinates(latitude: string, longitude: string) {
	const info = await getInfoFromCoordinates(latitude, longitude);
	const res  = await http.get(info.forecastUrl);
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const data = plainToClass(GridpointForecast, json);

	return data.periods[0];
}
