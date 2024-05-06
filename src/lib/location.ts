import { Cache } from '@lib/cache';
import { Point } from '@models/point';
import { HttpClient } from '@lib/http';
import { plainToClass } from 'class-transformer';

type CoordinateInfo = {
	latitude: string;
	longitude: string;
	location: string;
	zoneId: string;
	countyId: string;
	forecastUrl: string;
	radarImageUrl: string;
};

const cache            = new Cache('1 day');
const http             = new HttpClient({ baseUrl: 'https://api.weather.gov' });
const latitudePattern  = /^(\+|-)?(?:90(?:(?:\.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:\.[0-9]{1,6})?))$/;
const longitudePattern = /^(\+|-)?(?:180(?:(?:\.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:\.[0-9]{1,6})?))$/;

export function isValidCoordinates(coordinates: string): boolean;
export function isValidCoordinates(latitude: string, longitude: string): boolean;
export function isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: string): boolean {
	if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
		const split = combinedCoordinatesOrLatitude.split(',');
		const lat   = split[0].trim();
		const lon   = split[1].trim();

		return isValidCoordinates(lat, lon);
	} else {
		return latitudePattern.test(combinedCoordinatesOrLatitude) && longitudePattern.test(longitude);
	}
}

export async function getInfoFromCoordinates(latitude: string, longitude: string): Promise<CoordinateInfo> {
	const res = await http.get(`/points/${latitude},${longitude}`);
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const cacheKey = latitude + longitude;
	if (cache.has(cacheKey)) {
		return cache.get<CoordinateInfo>(cacheKey)!;
	}

	const json = await res.json();
	const data = plainToClass(Point, json);
	const info = {
		latitude,
		longitude,
		location: data.relativeLocation.cityState,
		zoneId: data.zoneId,
		countyId: data.countyId,
		forecastUrl: data.forecast,
		radarImageUrl: data.radarImageUrl
	};

	cache.set(cacheKey, info);

	return info;
}
