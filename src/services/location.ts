import { HttpService } from './http';
import { Point } from '@models/Point';
import { CacheService } from './cache';
import { container } from '@container';
import { HTTPRequestError } from '@lib/errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import type { HttpClient } from './http';
import type { CacheStore } from './cache';

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

export class LocationService {
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

	/**
	 * Whether the input coordinates are valid.
	 * @param coordinates The latitude and longitude joined by a comma (e.g. `21.3271,-157.8793`).
	 */
	public isValidCoordinates(coordinates: string): boolean;
	/**
	 * Whether the input coordinates are valid.
	 * @param latitude The latitude.
	 * @param longitude The longitude.
	 */
	public isValidCoordinates(latitude: string, longitude: string): boolean;
	/**
	 * Whether the input coordinates are valid.
	 * @param combinedCoordinatesOrLatitude The latitude and longitude joined by a comma or the latitude.
	 * @param longitude Optional longitude.
	 */
	public isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: string): boolean {
		if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
			const split = combinedCoordinatesOrLatitude.split(',');
			const lat   = split[0].trim();
			const lon   = split[1].trim();

			return this.isValidCoordinates(lat, lon);
		}

		return this.coordinatePattern.test(combinedCoordinatesOrLatitude)
			&& this.coordinatePattern.test(longitude);
	}

	/**
	 * Retrieves basic information about a location based on coordinates.
	 * @param latitude The latitude of the location to retrieve.
	 * @param longitude The longitude of the location to retrieve.
	 */
	public async getInfoFromCoordinates(latitude: string, longitude: string): Promise<CoordinateInfo> {
		const cacheKey = latitude + longitude;

		if (this.cache.has(cacheKey)) {
			return this.cache.get<CoordinateInfo>(cacheKey)!;
		}

		const res = await this.http.get(`/points/${latitude},${longitude}`);

		HTTPRequestError.assert(res.ok, res.statusText, {
			code: res.status,
			status: res.statusText
		});

		const json = await res.json();
		const data = plainToClass(Point, json);

		const info: CoordinateInfo = {
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

