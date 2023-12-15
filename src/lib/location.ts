import { logger } from '@logger';
import { Cache } from '@lib/cache';
import { Point } from '@models/point';
import { HttpClient } from '@lib/http';
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

const http  = new HttpClient({ baseUrl: 'https://api.weather.gov', retry: true });
const cache = new Cache('1 day');

export async function getCoordinateInfo(latitude: number, longitude: number): Promise<CoordinateInfo> {
	logger.debug('Retrieving info from coordinates', { latitude, longitude });

	const itemKey = `coords:${latitude},${longitude}`;
	if (cache.has(itemKey)) {
		logger.debug('Using cached results');

		return cache.get<CoordinateInfo>(itemKey)!;
	}

	logger.debug('Requesting info from API');

	const res = await http.get(`/points/${latitude},${longitude}`);
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

	cache.set(itemKey, locationInfo);

	return locationInfo!;
}
