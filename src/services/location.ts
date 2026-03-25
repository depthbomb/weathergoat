import { HTTPService } from './http';
import { Point } from '@models/Point';
import { RedisService } from './redis';
import { API_BASE_ENDPOINT } from '@constants';
import { deserialize } from '@depthbomb/serde';
import { inject, injectable } from '@needle-di/core';
import { HTTPRequestError, isWeatherGoatError } from '@errors';
import type { HTTPClient } from './http';

type CoverageSeed = {
	latitude: number;
	longitude: number;
};

type CoverageRegion = {
	minLatitude: number;
	maxLatitude: number;
	minLongitude: number;
	maxLongitude: number;
	seed: CoverageSeed;
};

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
	private readonly seedSearchRadii: readonly number[];
	private readonly nearestSearchBearings: readonly number[];
	private readonly coverageRegions: readonly CoverageRegion[];

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
		this.seedSearchRadii       = [0.1, 0.25, 0.5, 1];
		this.nearestSearchBearings = [0, 45, 90, 135, 180, 225, 270, 315];
		this.coverageRegions       = [
			{
				// Contiguous US
				minLatitude: 24,
				maxLatitude: 50,
				minLongitude: -126,
				maxLongitude: -66,
				seed: { latitude: 39.8283, longitude: -98.5795 }
			},
			{
				// Alaska (western hemisphere range)
				minLatitude: 51,
				maxLatitude: 72,
				minLongitude: -180,
				maxLongitude: -129,
				seed: { latitude: 61.2181, longitude: -149.9003 }
			},
			{
				// Alaska Aleutians (eastern hemisphere overlap near dateline)
				minLatitude: 51,
				maxLatitude: 72,
				minLongitude: 170,
				maxLongitude: 180,
				seed: { latitude: 61.2181, longitude: -149.9003 }
			},
			{
				// Hawaii
				minLatitude: 18,
				maxLatitude: 23,
				minLongitude: -161,
				maxLongitude: -154,
				seed: { latitude: 21.3069, longitude: -157.8583 }
			},
			{
				// Puerto Rico + USVI
				minLatitude: 17,
				maxLatitude: 19,
				minLongitude: -68,
				maxLongitude: -64,
				seed: { latitude: 18.4655, longitude: -66.1057 }
			},
			{
				// Guam + Northern Mariana Islands
				minLatitude: 13,
				maxLatitude: 21,
				minLongitude: 143,
				maxLongitude: 147,
				seed: { latitude: 13.4757, longitude: 144.7489 }
			},
			{
				// American Samoa
				minLatitude: -15,
				maxLatitude: -11,
				minLongitude: -171,
				maxLongitude: -168,
				seed: { latitude: -14.2756, longitude: -170.702 }
			}
		];
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

		if (this.isLikelyNearCoverageRegion(originLatitude, originLongitude)) {
			const nearby = await this.findNearestFromRings(
				originLatitude,
				originLongitude,
				originLatitude,
				originLongitude,
				this.nearestSearchRadii,
				cacheTTL
			);
			if (nearby) {
				return nearby;
			}
		}

		const seed = this.findNearestCoverageSeed(originLatitude, originLongitude);
		const seedLatitude  = this.normalizeCoordinate(seed.latitude);
		const seedLongitude = this.normalizeCoordinate(seed.longitude);
		const directSeed    = await this.tryGetInfoFromCoordinates(seedLatitude, seedLongitude, cacheTTL);
		if (directSeed) {
			return directSeed;
		}

		return this.findNearestFromRings(
			originLatitude,
			originLongitude,
			seed.latitude,
			seed.longitude,
			this.seedSearchRadii,
			cacheTTL
		);
	}

	private async findNearestFromRings(
		originLatitude: number,
		originLongitude: number,
		searchCenterLatitude: number,
		searchCenterLongitude: number,
		radii: readonly number[],
		cacheTTL: string
	): Promise<CoordinateInfo | null> {
		for (const radius of radii) {
			const candidates = this.generateNearbyCandidates(searchCenterLatitude, searchCenterLongitude, radius);
			const evaluations = await Promise.all(candidates.map(async candidate => {
				const info = await this.tryGetInfoFromCoordinates(candidate.latitude, candidate.longitude, cacheTTL);
				if (!info) {
					return null;
				}

				const distanceKm = this.calculateDistanceKm(
					originLatitude,
					originLongitude,
					Number.parseFloat(info.latitude),
					Number.parseFloat(info.longitude)
				);

				return { info, distanceKm };
			}));

			let best: { info: CoordinateInfo; distanceKm: number; } | null = null;
			for (const evaluation of evaluations) {
				if (!evaluation) {
					continue;
				}

				if (!best || evaluation.distanceKm < best.distanceKm) {
					best = evaluation;
				}
			}

			if (best) {
				return best.info;
			}
		}

		return null;
	}

	private async tryGetInfoFromCoordinates(latitude: string, longitude: string, cacheTTL: string): Promise<CoordinateInfo | null> {
		try {
			return await this.getInfoFromCoordinates(latitude, longitude, cacheTTL);
		} catch (err: unknown) {
			if (isWeatherGoatError(err, HTTPRequestError) && err.code === 404) {
				return null;
			}

			throw err;
		}
	}

	private isLikelyNearCoverageRegion(latitude: number, longitude: number): boolean {
		const margin = 6;
		for (const region of this.coverageRegions) {
			if (
				latitude >= (region.minLatitude - margin)
				&& latitude <= (region.maxLatitude + margin)
				&& longitude >= (region.minLongitude - margin)
				&& longitude <= (region.maxLongitude + margin)
			) {
				return true;
			}
		}

		return false;
	}

	private findNearestCoverageSeed(latitude: number, longitude: number): CoverageSeed {
		let bestSeed = this.coverageRegions[0]!.seed;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const region of this.coverageRegions) {
			const distanceKm = this.calculateDistanceKm(latitude, longitude, region.seed.latitude, region.seed.longitude);
			if (distanceKm < bestDistance) {
				bestDistance = distanceKm;
				bestSeed = region.seed;
			}
		}

		return bestSeed;
	}

	private generateNearbyCandidates(latitude: number, longitude: number, radius: number) {
		if (radius === 0) {
			return [{
				latitude: this.normalizeCoordinate(latitude),
				longitude: this.normalizeCoordinate(longitude)
			}];
		}

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
