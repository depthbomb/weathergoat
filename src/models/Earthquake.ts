export type EarthquakeReviewStatus = 'automatic' | 'reviewed' | 'deleted' | 'unknown';

export type EarthquakeCoordinates = {
	/** Latitude in decimal degrees, in the inclusive range -90 through 90. */
	latitude: number;
	/** Longitude in decimal degrees, in the inclusive range -180 through 180. */
	longitude: number;
	/** Hypocentral depth in kilometers. */
	depthKm: number;
};

export type EarthquakeProductContent = {
	path: string;
	contentType: string | null;
	lastModifiedAt: Date | null;
	length: number | null;
	url: string | null;
};

export type EarthquakeProduct = {
	type: string;
	id: string;
	code: string;
	source: string;
	updatedAt: Date;
	status: string;
	preferredWeight: number | null;
	contents: EarthquakeProductContent[];
};

export type EarthquakeEvent = {
	/** Source-native ComCat event ID. */
	id: string;
	/** Source revision timestamp. Identity plus this value identifies a revision. */
	updatedAt: Date;
	occurredAt: Date;
	coordinates: EarthquakeCoordinates;
	magnitude: number | null;
	magnitudeType: string | null;
	place: string | null;
	url: string | null;
	detailUrl: string | null;
	reviewStatus: EarthquakeReviewStatus;
	/** Unmodified provider status, retained when it is unknown to this client. */
	sourceStatus: string | null;
	eventType: string | null;
	significance: number | null;
	feltReports: number | null;
	tsunamiFlag: boolean | null;
	products: EarthquakeProduct[];
};

export type EarthquakeCollection = {
	events: EarthquakeEvent[];
	generatedAt: Date;
	sourceUrl: string | null;
};

export type EarthquakeSearchOptions = {
	startTime?: Date;
	endTime?: Date;
	minMagnitude?: number;
	limit?: number;
};

export type NearbyEarthquakeSearchOptions = EarthquakeSearchOptions & {
	latitude: number;
	longitude: number;
	radiusKm: number;
};
