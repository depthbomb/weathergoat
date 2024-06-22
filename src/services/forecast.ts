import { Tokens } from '@container';
import { HTTPRequestError } from '@lib/errors';
import { plainToClass } from 'class-transformer';
import { GridpointForecast } from '@models/GridpointForecast';
import type { IService } from '@services';
import type { Container } from '@container';
import type { ILocationService } from './location';
import type { HttpClient, IHttpService } from './http';
import type { GridpointForecastPeriod } from '@models/GridpointForecastPeriod';

export interface IForecastService extends IService {
	/**
	 * Retrieves the latest forecast period for the provided coordinates.
	 * @param latitude The latitude of the location.
	 * @param longitude The longitude of the location.
	 */
	getForecastForCoordinates(latitude: string, longitude: string): Promise<GridpointForecastPeriod>;
}

export default class ForecastService implements IForecastService {
	private readonly _http: HttpClient;
	private readonly _location: ILocationService;

	public constructor(container: Container) {
		const httpService = container.resolve<IHttpService>(Tokens.HTTP);

		this._http = httpService.getClient('forecasts', { retry: true });
		this._location = container.resolve(Tokens.Location);
	}

	public async getForecastForCoordinates(latitude: string, longitude: string): Promise<GridpointForecastPeriod> {
		const info = await this._location.getInfoFromCoordinates(latitude, longitude);
		const res  = await this._http.get(info.forecastUrl);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(GridpointForecast, json);

		return data.periods[0];
	}
}
