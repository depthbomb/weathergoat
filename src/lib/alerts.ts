import { logger } from '@logger';
import { URLSearchParams } from 'node:url';
import { nwsClient } from '@lib/nwsClient';
import type { IAlert } from '#IAlert';
import type { IAlertCollectionJsonLd } from '#IAlertCollectionJsonLd';

export async function getActiveAlerts(): Promise<IAlert[]> {
	logger.debug('Retrieving all active alerts');

	const alertsRes = await nwsClient<IAlertCollectionJsonLd>('/alerts/active');

	return alertsRes['@graph'];
}

export async function getActiveAlertsForZone(zoneIds: string[] = [], countyIds: string[] = []): Promise<IAlert[]> {
	logger.debug('Retrieving active alerts', { zoneIds, countyIds });

	const searchParams = new URLSearchParams();

	[...zoneIds, ...countyIds].map(id => searchParams.append('zone[]', id));

	const alertsRes = await nwsClient<IAlertCollectionJsonLd>(`/alerts/active?${searchParams}`);

	return alertsRes['@graph'];
}
