import { inject, injectable } from '@needle-di/core';
import { HTTPService, isNotModified, getCacheValidators } from './http';
import type { HTTPClient, HTTPCacheValidators } from './http';
import type {
	EarthquakeEvent,
	EarthquakeProduct,
	EarthquakeCollection,
	EarthquakeCoordinates,
	EarthquakeReviewStatus,
	EarthquakeSearchOptions,
	EarthquakeProductContent,
	NearbyEarthquakeSearchOptions
} from '@models/Earthquake';

export const USGS_BASE_URL = 'https://earthquake.usgs.gov';
export const DEFAULT_EARTHQUAKE_RESPONSE_LIMIT_BYTES = 2_000_000;
export const DEFAULT_EARTHQUAKE_STALE_AFTER_MS = 5 * 60_000;

const EARTH_RADIUS_KM = 6_371.0088;
const MAX_EVENTS = 20_000;
const MAX_SEARCH_RESULTS = 200;
const MAX_STRING_LENGTH = 4_096;
const MAX_PRODUCTS = 64;
const MAX_PRODUCT_CONTENTS = 32;
const MAX_RADIUS_KM = 20_001.6;
const DEFAULT_FUTURE_SKEW_MS = 5 * 60_000;
const INCLUDED_PRODUCT_TYPES = new Set([
	'dyfi',
	'finite-fault',
	'focal-mechanism',
	'general-link',
	'losspager',
	'moment-tensor',
	'origin',
	'shakemap'
]);

type UnknownRecord = Record<string, unknown>;

export type EarthquakeProviderErrorKind = 'invalid' | 'stale' | 'unavailable';

export class EarthquakeProviderError extends Error {
	public constructor(
		message: string,
		public readonly kind: EarthquakeProviderErrorKind,
		public readonly status?: number,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = new.target.name;
	}
}

export class EarthquakeUnavailableError extends EarthquakeProviderError {
	public constructor(message: string, status?: number, options?: ErrorOptions) {
		super(message, 'unavailable', status, options);
	}
}

export class EarthquakeInvalidResponseError extends EarthquakeProviderError {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, 'invalid', undefined, options);
	}
}

export class EarthquakeStaleResponseError extends EarthquakeProviderError {
	public constructor(
		message: string,
		public readonly generatedAt: Date,
		public readonly ageMs: number
	) {
		super(message, 'stale');
	}
}

export type EarthquakeParseOptions = {
	now?: Date;
	staleAfterMs?: number;
	maxFutureSkewMs?: number;
};

export type EarthquakeResponseOptions = EarthquakeParseOptions & {
	maxBytes?: number;
};

export type EarthquakeFeedResult = {
	validators: HTTPCacheValidators;
	notModified: true;
} | {
	validators: HTTPCacheValidators;
	notModified: false;
	collection: EarthquakeCollection;
};

function invalid(message: string): never {
	throw new EarthquakeInvalidResponseError(message);
}

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, path: string): UnknownRecord {
	if (!isRecord(value)) {
		invalid(`${path} must be an object.`);
	}

	return value;
}

function requiredString(value: unknown, path: string, maxLength = MAX_STRING_LENGTH): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
		invalid(`${path} must be a non-empty string no longer than ${maxLength} characters.`);
	}

	return value;
}

function nullableString(value: unknown, path: string, maxLength = MAX_STRING_LENGTH): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	return requiredString(value, path, maxLength);
}

function requiredFiniteNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		invalid(`${path} must be a finite number.`);
	}

	return value;
}

function nullableFiniteNumber(value: unknown, path: string): number | null {
	if (value === undefined || value === null) {
		return null;
	}

	return requiredFiniteNumber(value, path);
}

function nullableNonnegativeInteger(value: unknown, path: string): number | null {
	const parsed = nullableFiniteNumber(value, path);
	if (parsed !== null && (!Number.isSafeInteger(parsed) || parsed < 0)) {
		invalid(`${path} must be a non-negative safe integer when present.`);
	}

	return parsed;
}

function dateFromEpoch(value: unknown, path: string): Date {
	const epoch = requiredFiniteNumber(value, path);
	if (!Number.isSafeInteger(epoch)) {
		invalid(`${path} must be a millisecond-epoch safe integer.`);
	}

	const date = new Date(epoch);
	if (!Number.isFinite(date.getTime())) {
		invalid(`${path} is outside the supported date range.`);
	}

	return date;
}

function nullableDateFromEpoch(value: unknown, path: string): Date | null {
	if (value === undefined || value === null) {
		return null;
	}

	return dateFromEpoch(value, path);
}

function nullableUrl(value: unknown, path: string): string | null {
	const parsed = nullableString(value, path);
	if (parsed === null) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(parsed);
	} catch (cause) {
		throw new EarthquakeInvalidResponseError(`${path} must be a valid absolute URL.`, { cause });
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		invalid(`${path} must use HTTP or HTTPS.`);
	}

	return url.toString();
}

function normalizeReviewStatus(value: string | null): EarthquakeReviewStatus {
	if (value === 'automatic' || value === 'reviewed' || value === 'deleted') {
		return value;
	}

	return 'unknown';
}

export function validateEarthquakeCoordinates(
	latitude: number,
	longitude: number,
	depthKm = 0
): EarthquakeCoordinates {
	if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
		throw new RangeError('Earthquake latitude must be between -90 and 90 degrees.');
	}

	if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
		throw new RangeError('Earthquake longitude must be between -180 and 180 degrees.');
	}

	if (!Number.isFinite(depthKm) || depthKm < -100 || depthKm > 1_000) {
		throw new RangeError('Earthquake depth must be between -100 and 1000 kilometers.');
	}

	return { latitude, longitude, depthKm };
}

function parseGeometry(value: unknown, path: string): EarthquakeCoordinates {
	const geometry = requiredRecord(value, path);
	if (geometry.type !== 'Point') {
		invalid(`${path}.type must be "Point".`);
	}

	if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 3) {
		invalid(`${path}.coordinates must contain longitude, latitude, and depth.`);
	}

	const longitude = requiredFiniteNumber(geometry.coordinates[0], `${path}.coordinates[0]`);
	const latitude = requiredFiniteNumber(geometry.coordinates[1], `${path}.coordinates[1]`);
	const depthKm = requiredFiniteNumber(geometry.coordinates[2], `${path}.coordinates[2]`);
	try {
		return validateEarthquakeCoordinates(latitude, longitude, depthKm);
	} catch (cause) {
		throw new EarthquakeInvalidResponseError(`${path}.coordinates are outside supported ranges.`, { cause });
	}
}

function parseProductContent(value: unknown, path: string, contentPath: string): EarthquakeProductContent {
	const content = requiredRecord(value, path);

	return {
		path: contentPath,
		contentType: nullableString(content.contentType, `${path}.contentType`, 256),
		lastModifiedAt: nullableDateFromEpoch(content.lastModified, `${path}.lastModified`),
		length: nullableNonnegativeInteger(content.length, `${path}.length`),
		url: nullableUrl(content.url, `${path}.url`)
	};
}

function parseProduct(value: unknown, path: string, type: string): EarthquakeProduct {
	const product = requiredRecord(value, path);
	const contents: EarthquakeProductContent[] = [];
	if (product.contents !== undefined && product.contents !== null) {
		const rawContents = requiredRecord(product.contents, `${path}.contents`);
		const entries = Object.entries(rawContents);
		if (entries.length > MAX_PRODUCT_CONTENTS) {
			invalid(`${path}.contents exceeds the ${MAX_PRODUCT_CONTENTS}-item limit.`);
		}

		for (const [contentPath, content] of entries) {
			// USGS documents the empty path for content stored inline as `bytes`.
			if (contentPath.length > 1_024) {
				invalid(`${path}.contents contains an invalid path.`);
			}

			contents.push(parseProductContent(content, `${path}.contents[${JSON.stringify(contentPath)}]`, contentPath));
		}
	}

	return {
		type,
		id: requiredString(product.id, `${path}.id`, 512),
		code: requiredString(product.code, `${path}.code`, 256),
		source: requiredString(product.source, `${path}.source`, 64),
		updatedAt: dateFromEpoch(product.updateTime, `${path}.updateTime`),
		status: requiredString(product.status, `${path}.status`, 64),
		preferredWeight: nullableFiniteNumber(product.preferredWeight, `${path}.preferredWeight`),
		contents
	};
}

function parseProducts(value: unknown, path: string): EarthquakeProduct[] {
	if (value === undefined || value === null) {
		return [];
	}

	const products = requiredRecord(value, path);
	const parsed: EarthquakeProduct[] = [];
	for (const [type, rawProducts] of Object.entries(products)) {
		if (!INCLUDED_PRODUCT_TYPES.has(type)) {
			continue;
		}

		if (!Array.isArray(rawProducts)) {
			invalid(`${path}.${type} must be an array.`);
		}

		for (let index = 0; index < rawProducts.length; index++) {
			if (parsed.length >= MAX_PRODUCTS) {
				invalid(`${path} exceeds the ${MAX_PRODUCTS}-item selected product limit.`);
			}

			parsed.push(parseProduct(rawProducts[index], `${path}.${type}[${index}]`, type));
		}
	}

	return parsed;
}

export function parseEarthquakeFeature(value: unknown, path = 'feature'): EarthquakeEvent {
	const feature = requiredRecord(value, path);
	if (feature.type !== 'Feature') {
		invalid(`${path}.type must be "Feature".`);
	}

	const properties = requiredRecord(feature.properties, `${path}.properties`);
	const sourceStatus = nullableString(properties.status, `${path}.properties.status`, 64);
	const tsunami = nullableFiniteNumber(properties.tsunami, `${path}.properties.tsunami`);
	if (tsunami !== null && tsunami !== 0 && tsunami !== 1) {
		invalid(`${path}.properties.tsunami must be 0, 1, or null.`);
	}

	return {
		id: requiredString(feature.id, `${path}.id`, 256),
		updatedAt: dateFromEpoch(properties.updated, `${path}.properties.updated`),
		occurredAt: dateFromEpoch(properties.time, `${path}.properties.time`),
		coordinates: parseGeometry(feature.geometry, `${path}.geometry`),
		magnitude: nullableFiniteNumber(properties.mag, `${path}.properties.mag`),
		magnitudeType: nullableString(properties.magType, `${path}.properties.magType`, 64),
		place: nullableString(properties.place, `${path}.properties.place`, 1_024),
		url: nullableUrl(properties.url, `${path}.properties.url`),
		detailUrl: nullableUrl(properties.detail, `${path}.properties.detail`),
		reviewStatus: normalizeReviewStatus(sourceStatus),
		sourceStatus,
		eventType: nullableString(properties.type, `${path}.properties.type`, 128),
		significance: nullableNonnegativeInteger(properties.sig, `${path}.properties.sig`),
		feltReports: nullableNonnegativeInteger(properties.felt, `${path}.properties.felt`),
		tsunamiFlag: tsunami === null ? null : tsunami === 1,
		products: parseProducts(properties.products, `${path}.properties.products`)
	};
}

export function parseEarthquakeCollection(
	value: unknown,
	options: EarthquakeParseOptions = {}
): EarthquakeCollection {
	const collection = requiredRecord(value, 'response');
	if (collection.type !== 'FeatureCollection') {
		invalid('response.type must be "FeatureCollection".');
	}

	const metadata = requiredRecord(collection.metadata, 'response.metadata');
	const generatedAt = dateFromEpoch(metadata.generated, 'response.metadata.generated');
	const now = options.now ?? new Date();
	if (!Number.isFinite(now.getTime())) {
		throw new RangeError('Current time must be a valid Date.');
	}

	const maxFutureSkewMs = options.maxFutureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
	if (!Number.isSafeInteger(maxFutureSkewMs) || maxFutureSkewMs < 0) {
		throw new RangeError('Maximum provider clock skew must be a non-negative safe integer.');
	}

	if (options.staleAfterMs !== undefined && (!Number.isSafeInteger(options.staleAfterMs) || options.staleAfterMs < 0)) {
		throw new RangeError('Earthquake stale duration must be a non-negative safe integer.');
	}

	const ageMs = now.getTime() - generatedAt.getTime();
	if (ageMs < -maxFutureSkewMs) {
		invalid('response.metadata.generated is implausibly far in the future.');
	}

	if (options.staleAfterMs !== undefined && ageMs > options.staleAfterMs) {
		throw new EarthquakeStaleResponseError(
			`USGS response is stale by ${ageMs - options.staleAfterMs} milliseconds.`,
			generatedAt,
			ageMs
		);
	}

	if (!Array.isArray(collection.features)) {
		invalid('response.features must be an array.');
	}

	if (collection.features.length > MAX_EVENTS) {
		invalid(`response.features exceeds the ${MAX_EVENTS}-event limit.`);
	}

	const declaredCount = nullableNonnegativeInteger(metadata.count, 'response.metadata.count');
	if (declaredCount !== null && declaredCount !== collection.features.length) {
		invalid('response.metadata.count does not match response.features length.');
	}

	return {
		events: collection.features.map((feature, index) => parseEarthquakeFeature(feature, `response.features[${index}]`)),
		generatedAt,
		sourceUrl: nullableUrl(metadata.url, 'response.metadata.url')
	};
}

async function readBoundedJSON(res: Response, maxBytes: number): Promise<unknown> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
		throw new RangeError('Earthquake response byte limit must be a positive safe integer.');
	}

	if (res.status === 204 || !res.ok) {
		throw new EarthquakeUnavailableError(
			`USGS request failed with ${res.status} ${res.statusText || 'Unknown Status'}.`,
			res.status
		);
	}

	const contentType = res.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	if (contentType !== 'application/json' && contentType !== 'application/geo+json') {
		invalid(`USGS response has unsupported content type ${JSON.stringify(contentType ?? '')}.`);
	}

	const contentLength = res.headers.get('content-length');
	if (contentLength !== null) {
		const length = Number(contentLength);
		if (!Number.isSafeInteger(length) || length < 0) {
			invalid('USGS response has an invalid Content-Length header.');
		}

		if (length > maxBytes) {
			invalid(`USGS response exceeds the ${maxBytes}-byte limit.`);
		}
	}

	if (!res.body) {
		invalid('USGS response body is missing.');
	}

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				await reader.cancel('USGS response exceeded configured byte limit.');
				invalid(`USGS response exceeds the ${maxBytes}-byte limit.`);
			}

			chunks.push(value);
		}
	} catch (cause) {
		if (cause instanceof EarthquakeProviderError) {
			throw cause;
		}

		throw new EarthquakeUnavailableError('Unable to read the USGS response body.', res.status, { cause });
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (cause) {
		throw new EarthquakeInvalidResponseError('USGS response is not valid UTF-8.', { cause });
	}

	try {
		return JSON.parse(text) as unknown;
	} catch (cause) {
		throw new EarthquakeInvalidResponseError('USGS response is not valid JSON.', { cause });
	}
}

export async function parseEarthquakeCollectionResponse(
	res: Response,
	options: EarthquakeResponseOptions = {}
) {
	const json = await readBoundedJSON(res, options.maxBytes ?? DEFAULT_EARTHQUAKE_RESPONSE_LIMIT_BYTES);

	return parseEarthquakeCollection(json, options);
}

export async function parseEarthquakeFeatureResponse(
	res: Response,
	options: Pick<EarthquakeResponseOptions, 'maxBytes'> = {}
) {
	const json = await readBoundedJSON(res, options.maxBytes ?? DEFAULT_EARTHQUAKE_RESPONSE_LIMIT_BYTES);

	return parseEarthquakeFeature(json, 'response');
}

function validateSearchOptions(options: EarthquakeSearchOptions) {
	if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > MAX_SEARCH_RESULTS)) {
		throw new RangeError(`Earthquake query limit must be between 1 and ${MAX_SEARCH_RESULTS}.`);
	}

	if (options.minMagnitude !== undefined && !Number.isFinite(options.minMagnitude)) {
		throw new RangeError('Minimum magnitude must be finite.');
	}

	for (const [name, value] of [['startTime', options.startTime], ['endTime', options.endTime]] as const) {
		if (value !== undefined && !Number.isFinite(value.getTime())) {
			throw new RangeError(`${name} must be a valid Date.`);
		}
	}

	if (options.startTime && options.endTime && options.startTime > options.endTime) {
		throw new RangeError('Earthquake query start time must not be after end time.');
	}
}

function applySearchOptions(url: URL, options: EarthquakeSearchOptions) {
	validateSearchOptions(options);
	url.searchParams.set('format', 'geojson');
	url.searchParams.set('eventtype', 'earthquake');
	url.searchParams.set('orderby', 'time');
	if (options.startTime) {
		url.searchParams.set('starttime', options.startTime.toISOString());
	}

	if (options.endTime) {
		url.searchParams.set('endtime', options.endTime.toISOString());
	}

	if (options.minMagnitude !== undefined) {
		url.searchParams.set('minmagnitude', String(options.minMagnitude));
	}

	if (options.limit !== undefined) {
		url.searchParams.set('limit', String(options.limit));
	}
}

export function buildRecentEarthquakeURL(options: EarthquakeSearchOptions = {}) {
	const url = new URL('/fdsnws/event/1/query', USGS_BASE_URL);

	applySearchOptions(url, options);

	return url;
}

export function buildNearbyEarthquakeURL(options: NearbyEarthquakeSearchOptions) {
	validateEarthquakeCoordinates(options.latitude, options.longitude);
	if (!Number.isFinite(options.radiusKm) || options.radiusKm <= 0 || options.radiusKm > MAX_RADIUS_KM) {
		throw new RangeError(`Earthquake radius must be greater than 0 and at most ${MAX_RADIUS_KM} kilometers.`);
	}

	const url = buildRecentEarthquakeURL(options);
	url.searchParams.set('latitude', String(options.latitude));
	url.searchParams.set('longitude', String(options.longitude));
	url.searchParams.set('maxradiuskm', String(options.radiusKm));

	return url;
}

export function buildEarthquakeDetailURL(eventId: string) {
	if (!/^[A-Za-z0-9._-]{1,128}$/.test(eventId)) {
		throw new RangeError('USGS event ID contains unsupported characters or exceeds 128 characters.');
	}

	const url = new URL('/fdsnws/event/1/query', USGS_BASE_URL);
	url.searchParams.set('format', 'geojson');
	url.searchParams.set('eventid', eventId);

	return url;
}

/**
 * Calculates the great-circle distance between two latitude/longitude pairs.
 * Input is domain order (latitude, longitude); USGS GeoJSON is converted from
 * its source order (longitude, latitude, depth) before reaching this function.
 */
export function earthquakeDistanceKm(from: EarthquakeCoordinates, to: EarthquakeCoordinates) {
	validateEarthquakeCoordinates(from.latitude, from.longitude, from.depthKm);
	validateEarthquakeCoordinates(to.latitude, to.longitude, to.depthKm);

	const toRadians = (degrees: number) => degrees * Math.PI / 180;
	const latitudeDelta = toRadians(to.latitude - from.latitude);
	const longitudeDelta = toRadians(to.longitude - from.longitude);
	const fromLatitude = toRadians(from.latitude);
	const toLatitude = toRadians(to.latitude);
	const haversine = Math.sin(latitudeDelta / 2) ** 2
		+ Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
	const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));

	return EARTH_RADIUS_KM * centralAngle;
}

export function isEarthquakeWithinRadius(
	from: EarthquakeCoordinates,
	to: EarthquakeCoordinates,
	radiusKm: number
) {
	if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > MAX_RADIUS_KM) {
		throw new RangeError(`Earthquake radius must be between 0 and ${MAX_RADIUS_KM} kilometers.`);
	}

	return earthquakeDistanceKm(from, to) <= radiusKm;
}

@injectable()
export class EarthquakeService {
	private readonly client: HTTPClient;

	public constructor(
		private readonly http = inject(HTTPService)
	) {
		this.client = this.http.getClient('earthquakes', {
			baseUrl: USGS_BASE_URL,
			headers: { Accept: 'application/json' }
		});
	}

	public async getRecent(options: EarthquakeSearchOptions = {}) {
		const res = await this.client.get(buildRecentEarthquakeURL(options));

		return parseEarthquakeCollectionResponse(res, { staleAfterMs: DEFAULT_EARTHQUAKE_STALE_AFTER_MS });
	}

	public async getNearby(options: NearbyEarthquakeSearchOptions) {
		const res = await this.client.get(buildNearbyEarthquakeURL(options));

		return parseEarthquakeCollectionResponse(res, { staleAfterMs: DEFAULT_EARTHQUAKE_STALE_AFTER_MS });
	}

	public async getDetail(eventId: string) {
		const res = await this.client.get(buildEarthquakeDetailURL(eventId));

		return parseEarthquakeFeatureResponse(res);
	}

	public async getAllDayFeed() {
		const result = await this.getAllDayFeedResult();
		if (result.notModified) {
			throw new EarthquakeUnavailableError('USGS unexpectedly returned 304 without a cache validator request.', 304);
		}

		return result.collection;
	}

	public async getAllDayFeedResult(validators?: HTTPCacheValidators): Promise<EarthquakeFeedResult> {
		const res = await this.client.get('/earthquakes/feed/v1.0/summary/all_day.geojson', { validators });
		const nextValidators = getCacheValidators(res);
		if (isNotModified(res)) {
			return { validators: nextValidators, notModified: true };
		}

		return {
			validators: nextValidators,
			notModified: false,
			collection: await parseEarthquakeCollectionResponse(res, { staleAfterMs: DEFAULT_EARTHQUAKE_STALE_AFTER_MS })
		};
	}
}
