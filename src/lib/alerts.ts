import { logger } from '@logger';
import { Alert } from '@models/alert';
import { HttpClient } from '@lib/http';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';

const http = new HttpClient({ baseUrl: 'https://api.weather.gov' });

export async function getActiveAlerts(): Promise<Alert[]> {
	logger.debug('Retrieving all active alerts');

	const res = await http.get('/alerts/active');
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const col  = plainToClass(AlertCollection, json);

	return col.alerts;
}

export async function getActiveAlertsForZone(zoneIds: string[] = [], countyIds: string[] = []): Promise<Alert[] | null> {
	logger.debug('Retrieving active alerts', { zoneIds, countyIds });

	const res = await http.get('/alerts/active', {
		query: {
			'zone[]': [...zoneIds, ...countyIds]
		}
	});
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const col  = plainToClass(AlertCollection, json);
	if (!col.hasAlerts) {
		return null;
	}

	return col.alerts;
}
