import { HTTPService } from './http';
import { logger } from '@lib/logger';
import { HTTPRequestError } from '@errors';
import { API_BASE_ENDPOINT } from '@constants';
import { deserialize } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { AlertCollection } from '@models/AlertCollection';
import type { HTTPClient } from './http';
import type { LogLayer } from 'loglayer';

@injectable()
export class AlertsService {
	private readonly logger: LogLayer;
	private readonly client: HTTPClient;

	public constructor(
		private readonly http = inject(HTTPService)
	) {
		this.logger = logger.child().withPrefix(AlertsService.name.bracketWrap());
		this.client = this.http.getClient('alerts', {
			baseUrl: API_BASE_ENDPOINT,
			headers: {
				Accept: 'application/ld+json'
			}
		});
	}

	/**
	 * Retrieves all active weather alerts.
	 */
	public async getActiveAlerts() {
		const res = await this.client.get('/alerts/active?status=actual');
		if (!res.ok) {
			if (res.status === 503) {
				this.logger.warn('Unable to retrieve all active alerts, upstream API unavailable.');
				return;
			}

			throw new HTTPRequestError(res.statusText, { code: res.status, status: res.statusText });
		}

		const json = await res.json();
		const data = deserialize(AlertCollection, json);

		return data.alerts;
	}

	/**
	 * Retrieves weather alerts for a zone.
	 *
	 * @param zoneId The ID of the zone to retrieve alerts of.
	 */
	public async getActiveAlertsForZone(zoneId: string) {
		const res = await this.client.get(`/alerts/active/zone/${zoneId}`);
		if (!res.ok) {
			if (res.status === 503) {
				this.logger
					.withMetadata({ zoneId })
					.warn('Unable to retrieve active alerts for zone, upstream API unavailable.');
				return;
			}

			throw new HTTPRequestError(res.statusText, { code: res.status, status: res.statusText });
		}

		const json = await res.json();
		const data = deserialize(AlertCollection, json);

		return data.alerts;
	}
}
