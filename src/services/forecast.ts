import { Tokens } from '@tokens';
import { inject, singleton } from 'tsyringe';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/gridpoint-forecast';
import type { LocationService } from '@services/location';
import type { HttpClient, HttpService } from '@services/http';

@singleton()
export class ForecastService {
	private readonly _http: HttpClient;

	public constructor(
		@inject(Tokens.Http) httpService: HttpService,
		@inject(Tokens.Location) private readonly _location: LocationService
	) {
		this._http = httpService.createClient({ retry: true });
	}

	public async getForecastForCoordinates(latitude: string, longitude: string) {
		const info = await this._location.getInfoFromCoordinates(latitude, longitude);
		const res  = await this._http.get(info.forecastUrl);
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
}
