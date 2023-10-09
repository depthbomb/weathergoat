import { logger } from '@logger';
import { storage } from '@storage';
import { nwsClient } from '@lib/nwsClient';
import type { IPointJsonLd } from '#IPointJsonLd';

type CoordinateInfo = {
	latitude:      number;
	longitude:     number;
	location:      string;
	zoneId:        string;
	countyId:      string;
	forecastUrl:   string;
	radarImageUrl: string;
}

export async function getCoordinateInfo(latitude: number, longitude: number): Promise<CoordinateInfo> {
	logger.debug('Retrieving info from coordinates', { latitude, longitude });

	const itemKey = `coordinateInfo:${latitude},${longitude}`;

	const cachedInfo = await storage.getItem<CoordinateInfo>(itemKey);
	if (cachedInfo) {
		logger.debug('Using cached results');

		return cachedInfo;
	}

	logger.debug('Requesting info from API');

	const {
		forecast,
		county,
		forecastZone,
		radarStation,
		relativeLocation
	} = await nwsClient<IPointJsonLd>(`/points/${latitude},${longitude}`);

	const locationInfo = {
		latitude,
		longitude,
		location: `${relativeLocation.city}, ${relativeLocation.state}`,
		zoneId: extractLocationID(forecastZone),
		countyId: county ? extractLocationID(county) : '',
		forecastUrl: forecast,
		radarImageUrl: `https://radar.weather.gov/ridge/standard/${radarStation}_loop.gif`
	};

	await storage.setItem(itemKey, locationInfo);

	return locationInfo!;
}

function extractLocationID(url: string): string {
	const segments = url.split('/');
	return segments[segments.length - 1]!;
}
