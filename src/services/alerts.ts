import { httpService } from './http';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';
import type { IService } from '@services';
import type { Alert } from '@models/alert';

interface IAlertsService extends IService {
	[kHttpClient]: ReturnType<typeof httpService.getClient>;
	/**
	 * Retrieves all active alerts.
	 */
	getActiveAlerts(): Promise<Alert[]>;
	/**
	 * Retrieves weather alerts for a zone.
	 * @param zoneId The ID of the zone to retrieve alerts of.
	 * @param countyId Optional county ID to retrieve alerts of.
	 */
	getActiveAlertsForZone(zoneId: string, countyId?: string): Promise<Alert[]>;
}

const kHttpClient = Symbol('http-client');

export const alertsService: IAlertsService = ({
	name: 'Alerts',

	[kHttpClient]: httpService.getClient('alerts', { baseUrl: 'https://api.weather.gov' }),

	async getActiveAlerts() {
		const res = await this[kHttpClient].get('/alerts/active');
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	},
	async getActiveAlertsForZone(zoneId: string, countyId?: string) {
		const ids = [zoneId];
		if (countyId) {
			ids.push(countyId);
		}

		const res = await this[kHttpClient].get('/alerts/active', {
			query: {
				'zone[]': ids
			}
		});
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
});
