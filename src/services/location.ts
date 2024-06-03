import { Tokens } from '@tokens';
import { Cache } from '@lib/cache';
import { Point } from '@models/point';
import { inject, singleton } from 'tsyringe';
import { plainToClass } from 'class-transformer';
import type { HttpClient, HttpService } from '@services/http';

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

const cache = new Cache('1 day');

@singleton()
export class LocationService {
	private readonly _http: HttpClient;
	private readonly _latitudePattern: RegExp;
	private readonly _longitudePattern: RegExp;

	public constructor(@inject(Tokens.Http) httpService: HttpService) {
		this._http             = httpService.createClient({ baseUrl: 'https://api.weather.gov' });
		this._latitudePattern  = /^(\+|-)?(?:90(?:(?:\.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:\.[0-9]{1,6})?))$/;
		this._longitudePattern = /^(\+|-)?(?:180(?:(?:\.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:\.[0-9]{1,6})?))$/;
	}

	public isValidCoordinates(coordinates: string): boolean;
	public isValidCoordinates(latitude: string, longitude: string): boolean;
	public isValidCoordinates(combinedCoordinatesOrLatitude: string, longitude?: string): boolean {
		if (combinedCoordinatesOrLatitude.includes(',') || !longitude) {
			const split = combinedCoordinatesOrLatitude.split(',');
			const lat   = split[0].trim();
			const lon   = split[1].trim();

			return this.isValidCoordinates(lat, lon);
		}

		return this._latitudePattern.test(combinedCoordinatesOrLatitude) && this._longitudePattern.test(longitude);
	}

	public async getInfoFromCoordinates(latitude: string, longitude: string) {
		const res = await this._http.get(`/points/${latitude},${longitude}`);
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
			radarStation: data.radarStation,
			radarImageUrl: data.radarImageUrl
		};

		cache.set(cacheKey, info);

		return info;
	}
}
