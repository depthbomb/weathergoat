import { HTTPService } from './http';
import { HTTPRequestError } from '@lib/errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import { inject, injectable } from '@needle-di/core';
import { AlertCollection } from '@models/AlertCollection';
import type { HTTPClient } from './http';

@injectable()
export class AlertsService {
	private readonly client: HTTPClient;

	public constructor(
		private readonly http = inject(HTTPService)
	) {
		this.client = this.http.getClient('alerts', { baseUrl: API_BASE_ENDPOINT });
	}

	/**
	 * Retrieves all active weather alerts.
	 */
	public async getActiveAlerts() {
		const res = await this.client.get('/alerts/active');

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
		const res = await this.client.get(`/alerts/active/zone/${zoneId}`);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
}
