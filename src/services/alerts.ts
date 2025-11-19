import { HttpService } from './http';
import { container } from '@container';
import { HTTPRequestError } from '@lib/errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/AlertCollection';
import type { HttpClient } from './http';

export class AlertsService {
	private readonly http: HttpClient;

	public constructor() {
		this.http = container.resolve(HttpService).getClient('alerts', { baseUrl: API_BASE_ENDPOINT });
	}

	/**
	 * Retrieves all active weather alerts.
	 */
	public async getActiveAlerts() {
		const res = await this.http.get('/alerts/active');

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}

	/**
	 * Retrieves weather alerts for a zone.
	 *
	 * @param zoneId The ID of the zone to retrieve alerts of.
	 */
	public async getActiveAlertsForZone(zoneId: string) {
		const res = await this.http.get(`/alerts/active/zone/${zoneId}`);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
}
