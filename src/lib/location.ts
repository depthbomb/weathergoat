import { logger } from '@logger';
import { storage } from '@storage';
import { Point } from '@models/point';
import { makeRequest } from '@lib/http';
import { plainToClass } from 'class-transformer';

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

	const res = await makeRequest(`/points/${latitude},${longitude}`);
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json         = await res.json();
	const point        = plainToClass(Point, json);
	const locationInfo = {
		latitude,
		longitude,
		location: point.relativeLocation.cityState,
		zoneId: point.zoneId,
		countyId: point.countyId,
		forecastUrl: point.forecast,
		radarImageUrl: point.radarImageUrl
	};

	await storage.setItem(itemKey, locationInfo);

	return locationInfo!;
}
