import { HttpClient } from '@lib/http';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';

const http = new HttpClient({ baseUrl: 'https://api.weather.gov' });

export async function getActiveAlerts() {
	const res = await http.get('/alerts/active');
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const data = plainToClass(AlertCollection, json);

	return data.alerts;
}

export async function getActiveAlertsForZone(zoneId: string, countyId?: string) {
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
