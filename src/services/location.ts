import { HttpService } from './http';
import { Point } from '@models/Point';
import { CacheService } from './cache';
import { container } from '@container';
import { HTTPRequestError } from '@errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import type { Maybe } from '#types';
import type { HttpClient } from './http';
import type { CacheStore } from './cache';
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

export interface ILocationService extends IService {
	/**
	 * Whether the input coordinates are valid.
	 * @param coordinates The latitude and longitude joined by a comma (for example
	 * `21.3271,-157.8793`).
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
	 * @param combinedCoordinatesOrLatitude The latitude and longitude joined by a comma or the
	 * latitude.
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

export class LocationService implements ILocationService {
	private readonly http: HttpClient;
	private readonly cache: CacheStore;
	private readonly coordinatePattern: RegExp;
	private readonly coordinatesPattern: RegExp;

	public constructor() {
		this.http               = container.resolve(HttpService).getClient('location', { baseUrl: API_BASE_ENDPOINT });
		this.cache              = container.resolve(CacheService).getStore('locations', { defaultTtl: '1 week' });
		this.coordinatePattern  = /^(-?\d+(?:\.\d+)?)$/;
		this.coordinatesPattern = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
	}

	public isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: Maybe<string>): boolean {
		if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
			const split = combinedCoordinatesOrLatitude.split(',');
			const lat   = split[0].trim();
			const lon   = split[1].trim();

			return this.isValidCoordinates(lat, lon);
		}

		return this.coordinatePattern.test(combinedCoordinatesOrLatitude) && this.coordinatePattern.test(longitude as string);
	}

	public async getInfoFromCoordinates(latitude: string, longitude: string) {
		const cacheKey = latitude + longitude;
		if (this.cache.has(cacheKey)) {
			return this.cache.get<CoordinateInfo>(cacheKey)!;
		}

		const res = await this.http.get(`/points/${latitude},${longitude}`);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

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

		this.cache.set(cacheKey, info);

		return info;
	}
}
