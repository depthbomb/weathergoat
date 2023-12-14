import { logger } from '@logger';
import { Alert } from '@models/alert';
import { makeRequest } from '@lib/http';
import { URLSearchParams } from 'node:url';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';

export async function getActiveAlerts(): Promise<Alert[]> {
	logger.debug('Retrieving all active alerts');

	const res = await makeRequest('/alerts/active');
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const col  = plainToClass(AlertCollection, json);

	return col.alerts;
}

export async function getActiveAlertsForZone(zoneIds: string[] = [], countyIds: string[] = []): Promise<Alert[]> {
	logger.debug('Retrieving active alerts', { zoneIds, countyIds });

	const searchParams = new URLSearchParams();

	[...zoneIds, ...countyIds].map(id => searchParams.append('zone[]', id));

	const res = await makeRequest(`/alerts/active?${searchParams}`);
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const col  = plainToClass(AlertCollection, json);

	return col.alerts;
}
