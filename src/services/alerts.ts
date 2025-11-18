import { HttpService } from './http';
import { container } from '@container';
import { HTTPRequestError } from '@errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/AlertCollection';
import type { HttpClient } from './http';
import type { IService } from '@services';
import type { Alert } from '@models/Alert';

export interface IAlertsService extends IService {
	/**
	 * Retrieves all active weather alerts.
	 */
	getActiveAlerts(): Promise<Alert[]>;
	/**
	 * Retrieves weather alerts for a zone.
	 *
	 * @param zoneId The ID of the zone to retrieve alerts of.
	 */
	getActiveAlertsForZone(zoneId: string): Promise<Alert[]>;
}

export class AlertsService implements IAlertsService {
	private readonly http: HttpClient;

	public constructor() {
		this.http = container.resolve(HttpService).getClient('alerts', { baseUrl: API_BASE_ENDPOINT });
	}

	public async getActiveAlerts() {
		const res = await this.http.get('/alerts/active');

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}

	public async getActiveAlertsForZone(zoneId: string) {
		const res = await this.http.get(`/alerts/active/zone/${zoneId}`);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
}
