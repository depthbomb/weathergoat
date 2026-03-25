import { HTTPService } from './http';
import { Point } from '@models/Point';
import { RedisService } from './redis';
import { API_BASE_ENDPOINT } from '@constants';
import { deserialize } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { HTTPRequestError, isWeatherGoatError } from '@errors';
import type { HTTPClient } from './http';

export type CoordinateInfo = {
	latitude: string;
	longitude: string;
	location: string;
	zoneId: string;
	countyId: string;
	forecastUrl: string;
	radarStation: string;
	radarImageUrl: string;
};

export type CoordinateLookupResult = {
	requestedLatitude: string;
	requestedLongitude: string;
	wasAdjusted: boolean;
	info: CoordinateInfo;
};

@injectable()
export class LocationService {
	private readonly client: HTTPClient;
	private readonly coordinatePattern: RegExp;
	private readonly nearestSearchRadii: readonly number[];
	private readonly nearestSearchBearings: readonly number[];

	public constructor(
		private readonly http  = inject(HTTPService),
		private readonly redis = inject(RedisService),
	) {
		this.client = this.http.getClient('location', {
			baseUrl: API_BASE_ENDPOINT,
			headers: {
				Accept: 'application/ld+json'
			}
		});
		this.coordinatePattern     = /^(-?\d+(?:\.\d+)?)$/;
		this.nearestSearchRadii    = [0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
		this.nearestSearchBearings = [0, 45, 90, 135, 180, 225, 270, 315];
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
		if (typeof longitude === 'undefined') {
			if (!combinedCoordinatesOrLatitude.includes(',')) {
				return false;
			}

			const split = combinedCoordinatesOrLatitude.split(',');
			if (split.length !== 2) {
				return false;
			}

			const lat = split[0]?.trim();
			const lon = split[1]?.trim();
			if (!lat || !lon) {
				return false;
			}

			return this.isValidCoordinates(lat, lon);
		}

		const latitude = combinedCoordinatesOrLatitude.trim();
		const lon      = longitude.trim();

		return this.isCoordinateInRange(latitude, -90, 90) && this.isCoordinateInRange(lon, -180, 180);
	}

	/**
	 * Retrieves info for the provided coordinates, or the nearest valid NWS location if the
	 * requested location is outside NWS coverage.
	 */
	public async getInfoFromCoordinatesOrNearest(latitude: string, longitude: string, cacheTTL = '1w'): Promise<CoordinateLookupResult> {
		const requestedLatitude  = latitude.trim();
		const requestedLongitude = longitude.trim();
		const cacheKey           = `coordinate-lookup:${requestedLatitude},${requestedLongitude}`;
		const cached             = await this.redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached) as CoordinateLookupResult;
		}

		try {
			const info   = await this.getInfoFromCoordinates(requestedLatitude, requestedLongitude, cacheTTL);
			const result = {
				requestedLatitude,
				requestedLongitude,
				wasAdjusted: false,
				info
			} as CoordinateLookupResult;
			await this.redis.set(cacheKey, JSON.stringify(result), cacheTTL);
			return result;
		} catch (err: unknown) {
			if (!isWeatherGoatError(err, HTTPRequestError) || err.code !== 404) {
				throw err;
			}

			const nearest = await this.findNearestValidCoordinates(requestedLatitude, requestedLongitude, cacheTTL);
			if (!nearest) {
				throw err;
			}

			const result = {
				requestedLatitude,
				requestedLongitude,
				wasAdjusted: true,
				info: nearest
			} as CoordinateLookupResult;
			await this.redis.set(cacheKey, JSON.stringify(result), cacheTTL);
			return result;
		}
	}

	/**
	 * Retrieves basic information about a location based on coordinates.
	 * @param latitude The latitude of the location to retrieve.
	 * @param longitude The longitude of the location to retrieve.
	 * @param cacheTTL How long the coordinate info should be cached.
	 */
	public async getInfoFromCoordinates(latitude: string, longitude: string, cacheTTL = '1w'): Promise<CoordinateInfo> {
		const normalizedLatitude  = latitude.trim();
		const normalizedLongitude = longitude.trim();
		const cacheKey            = `coordinates:${normalizedLatitude},${normalizedLongitude}`;
		const cached              = await this.redis.get(cacheKey);
		if (cached) {
			return JSON.parse(cached) as CoordinateInfo;
		}

		const res = await this.client.get(`/points/${normalizedLatitude},${normalizedLongitude}`);

		HTTPRequestError.assert(res.ok, res.statusText, {
			code: res.status,
			status: res.statusText
		});

		const json = await res.json();
		const data = deserialize(Point, json);

		const info = {
			latitude: normalizedLatitude,
			longitude: normalizedLongitude,
			location: data.relativeLocation.cityState,
			zoneId: data.zoneId,
			countyId: data.countyId,
			forecastUrl: data.forecast,
			radarStation: data.radarStation,
			radarImageUrl: data.radarImageUrl
		} as CoordinateInfo;

		await this.redis.set(cacheKey, JSON.stringify(info), cacheTTL);

		return info;
	}

	private async findNearestValidCoordinates(latitude: string, longitude: string, cacheTTL: string): Promise<CoordinateInfo | null> {
		const originLatitude  = Number.parseFloat(latitude);
		const originLongitude = Number.parseFloat(longitude);
		for (const radius of this.nearestSearchRadii) {
			const candidates = this.generateNearbyCandidates(originLatitude, originLongitude, radius);
			let best: { info: CoordinateInfo; distanceKm: number; } | null = null;
			for (const candidate of candidates) {
				try {
					const info       = await this.getInfoFromCoordinates(candidate.latitude, candidate.longitude, cacheTTL);
					const distanceKm = this.calculateDistanceKm(originLatitude, originLongitude, Number.parseFloat(info.latitude), Number.parseFloat(info.longitude));
					if (!best || distanceKm < best.distanceKm) {
						best = { info, distanceKm };
					}
				} catch (err: unknown) {
					if (isWeatherGoatError(err, HTTPRequestError) && err.code === 404) {
						continue;
					}

					throw err;
				}
			}

			if (best) {
				return best.info;
			}
		}

		return null;
	}

	private generateNearbyCandidates(latitude: number, longitude: number, radius: number) {
		const latitudeRadians = (latitude * Math.PI) / 180;
		const longitudeScale  = Math.max(Math.cos(latitudeRadians), 0.2);
		const candidates      = [] as Array<{ latitude: string; longitude: string; }>;
		const seen            = new Set<string>();

		for (const bearing of this.nearestSearchBearings) {
			const bearingRadians = (bearing * Math.PI) / 180;
			const candidateLat   = latitude + (radius * Math.cos(bearingRadians));
			const candidateLon   = this.wrapLongitude(longitude + ((radius * Math.sin(bearingRadians)) / longitudeScale));

			if (candidateLat < -90 || candidateLat > 90) {
				continue;
			}

			const normalizedLatitude  = this.normalizeCoordinate(candidateLat);
			const normalizedLongitude = this.normalizeCoordinate(candidateLon);
			const key                 = `${normalizedLatitude},${normalizedLongitude}`;
			if (seen.has(key)) {
				continue;
			}

			candidates.push({ latitude: normalizedLatitude, longitude: normalizedLongitude });
			seen.add(key);
		}

		return candidates;
	}

	private normalizeCoordinate(value: number): string {
		const normalized = Number.parseFloat(value.toFixed(4));
		return normalized.toString();
	}

	private wrapLongitude(longitude: number): number {
		if (longitude > 180) {
			return longitude - 360;
		}

		if (longitude < -180) {
			return longitude + 360;
		}

		return longitude;
	}

	private calculateDistanceKm(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number): number {
		const lat1 = (fromLatitude * Math.PI) / 180;
		const lon1 = (fromLongitude * Math.PI) / 180;
		const lat2 = (toLatitude * Math.PI) / 180;
		const lon2 = (toLongitude * Math.PI) / 180;

		const deltaLatitude  = lat2 - lat1;
		const deltaLongitude = lon2 - lon1;
		const a              = Math.sin(deltaLatitude / 2) ** 2 + (Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2);
		const c              = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return 6_371 * c;
	}

	private isCoordinateInRange(input: string, min: number, max: number): boolean {
		if (!this.coordinatePattern.test(input)) {
			return false;
		}

		const value = Number.parseFloat(input);
		return Number.isFinite(value) && value >= min && value <= max;
	}
}

