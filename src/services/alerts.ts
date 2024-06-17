import { Tokens } from '@container';
import { HTTPRequestError } from '@lib/errors';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/AlertCollection';
import type { IService } from '@services';
import type { Alert } from '@models/Alert';
import type { Container } from '@container';
import type { HttpClient, IHttpService } from './http';

export interface IAlertsService extends IService {
	/**
	 * Retrieves all active weather alerts.
	 */
	getActiveAlerts(): Promise<Alert[]>;
	/**
	 * Retrieves weather alerts for a zone.
	 *
	 * @param zoneId The ID of the zone to retrieve alerts of.
	 * @param countyId Optional county ID to retrieve alerts of.
	 */
	getActiveAlertsForZone(zoneId: string, countyId?: string): Promise<Alert[]>;
}

export default class AlertsService implements IAlertsService {
	private readonly _http: HttpClient;

	public constructor(container: Container) {
		const httpService = container.resolve<IHttpService>(Tokens.HTTP);
		this._http = httpService.getClient('alerts', { baseUrl: 'https://api.weather.gov' });
	}

	public async getActiveAlerts(): Promise<Alert[]> {
		const res = await this._http.get('/alerts/active');

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}

	public async getActiveAlertsForZone(zoneId: string, countyId?: string): Promise<Alert[]> {
		const ids = [zoneId];
		if (countyId) {
			ids.push(countyId);
		}

		const res = await this._http.get('/alerts/active', {
			query: {
				'zone[]': ids
			}
		});

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
}
