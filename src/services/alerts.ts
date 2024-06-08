import { httpService } from './http';
import { defineService } from '@services';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';
import type { Alert } from '@models/alert';

interface IAlertsService {
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

export const alertsService = defineService<IAlertsService>('Alerts', () => {
	const http = httpService.getClient('alerts', { baseUrl: 'https://api.weather.gov' });

	async function getActiveAlerts() {
		const res = await http.get('/alerts/active');
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}

	async function getActiveAlertsForZone(zoneId: string, countyId?: string) {
		const ids = [zoneId];
		if (countyId) {
			ids.push(countyId);
		}

		const res = await http.get('/alerts/active', {
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

	return { getActiveAlerts, getActiveAlertsForZone };
});
