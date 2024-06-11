import { httpService } from './http';
import { Point } from '@models/point';
import { cacheService } from './cache';
import { plainToClass } from 'class-transformer';
import type { IService } from '@services';

type CoordinateInfo = {
	latitude: string;
	longitude: string;
	location: string;
	zoneId: string;
	countyId: string;
	forecastUrl: string;
	radarStation: string;
	radarImageUrl: string;
};

interface ILocationService extends IService {
	/**
	 * @internal
	 */
	[kLocationCache]: ReturnType<typeof cacheService.getOrCreateStore>;
	/**
	 * @internal
	 */
	[kLocationHttpClient]: ReturnType<typeof httpService.getClient>;
	/**
	 * @internal
	 */
	[kLatitudePattern]: RegExp;
	/**
	 * @internal
	 */
	[kLongitudePattern]: RegExp;
	/**
	 * Whether the input coordinates are valid.
	 * @param coordinates The latitude and longitude joined by a comma (for example `21.3271,-157.8793`).
	 */
	isValidCoordinates(coordinates: string): boolean;
	/**
	 * Whether the input coordinates are valid.
	 * @param latitude The latitude.
	 * @param longitude The longitude.
	 */
	isValidCoordinates(latitude: string, longitude: string): boolean;
	/**
	 * Whether the input coordinates are valid.
	 * @param combinedCoordinatesOrLatitude The latitude and longitude joined by a comma or the latitude.
	 * @param longitude The optional longitude.
	 */
	isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: string): boolean;
	/**
	 * Retrieves basic information about a location based on coordinates.
	 * @param latitude The latitude of the location to retrieve info on.
	 * @param longitude The longitude of the location to retrieve info on.
	 */
	getInfoFromCoordinates(latitude: string, longitude: string): Promise<CoordinateInfo>;
}

const kLocationCache      = Symbol('location-cache');
const kLocationHttpClient = Symbol('location-http-client');
const kLatitudePattern    = Symbol('latitude-pattern');
const kLongitudePattern   = Symbol('longitude-pattern');

export const locationService: ILocationService = ({
	name: 'com.weathergoat.services.Location',

	[kLocationCache]: cacheService.getOrCreateStore('locations', '1 week'),
	[kLocationHttpClient]: httpService.getClient('location', { baseUrl: 'https://api.weather.gov', retry: true }),
	[kLatitudePattern]: /^(\+|-)?(?:90(?:(?:\.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:\.[0-9]{1,6})?))$/,
	[kLongitudePattern]: /^(\+|-)?(?:180(?:(?:\.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:\.[0-9]{1,6})?))$/,

	isValidCoordinates(combinedCoordinatesOrLatitude, longitude?) {
		if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
			const split = combinedCoordinatesOrLatitude.split(',');
			const lat   = split[0].trim();
			const lon   = split[1].trim();

			return this.isValidCoordinates(lat, lon);
		}

		return this[kLatitudePattern].test(combinedCoordinatesOrLatitude) && this[kLongitudePattern].test(longitude as string);
	},
	async getInfoFromCoordinates(latitude, longitude) {
		const res = await this[kLocationHttpClient].get(`/points/${latitude},${longitude}`);
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const cacheKey = latitude + longitude;
		if (this[kLocationCache].has(cacheKey)) {
			return this[kLocationCache].get<CoordinateInfo>(cacheKey)!;
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
			radarStation: data.radarStation,
			radarImageUrl: data.radarImageUrl
		};

		this[kLocationCache].set(cacheKey, info);

		return info;
	},
});
