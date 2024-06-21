import { Tokens } from '@container';
import { Point } from '@models/Point';
import { HTTPRequestError } from '@lib/errors';
import { API_BASE_ENDPOINT } from '@constants';
import { plainToClass } from 'class-transformer';
import type { Maybe } from '#types';
import type { IService } from '@services';
import type { Container } from '@container';
import type { HttpClient, IHttpService } from './http';
import type { CacheStore, ICacheService } from './cache';

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

export default class LocationService implements ILocationService {
	private readonly _http: HttpClient;
	private readonly _cache: CacheStore;
	private readonly _coordinatePattern: RegExp;
	private readonly _coordinatesPattern: RegExp;

	public constructor(container: Container) {
		const httpService = container.resolve<IHttpService>(Tokens.HTTP);
		const cacheService = container.resolve<ICacheService>(Tokens.Cache);

		this._http = httpService.getClient('location', { baseUrl: API_BASE_ENDPOINT, retry: true });
		this._cache = cacheService.createStore('locations', '1 day');
		this._coordinatePattern = /^(-?\d+(?:\.\d+)?)$/;
		this._coordinatesPattern = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
	}

	public isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: Maybe<string>): boolean {
		if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
			const split = combinedCoordinatesOrLatitude.split(',');
			const lat = split[0].trim();
			const lon = split[1].trim();

			return this.isValidCoordinates(lat, lon);
		}

		return this._coordinatePattern.test(combinedCoordinatesOrLatitude) && this._coordinatePattern.test(longitude as string);
	}

	public async getInfoFromCoordinates(latitude: string, longitude: string): Promise<CoordinateInfo> {
		const res = await this._http.get(`/points/${latitude},${longitude}`);

		HTTPRequestError.assert(res.ok, res.statusText, { code: res.status, status: res.statusText });

		const cacheKey = latitude + longitude;
		if (this._cache.has(cacheKey)) {
			return this._cache.get<CoordinateInfo>(cacheKey)!;
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

		this._cache.set(cacheKey, info);

		return info;
	}
}
