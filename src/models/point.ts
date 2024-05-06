import { Type } from 'class-transformer';
import { RelativeLocation } from '@models/relative-location';

export class Point {
	public gridX!: number;
	public gridY!: number;
	public forecast!: string;
	public forecastHourly!: string;
	public forecastGridData!: string;
	public observationStations!: string;
	@Type(() => RelativeLocation)
	public relativeLocation!: RelativeLocation;
	public forecastZone!: string;
	public county?: string;
	public fireWeatherZone!: string;
	public timeZone!: string;
	public radarStation!: string;

	public get countyId() {
		return this.county ? this.extractLastUrlSegment(this.county) : '';
	}

	public get zoneId() {
		return this.extractLastUrlSegment(this.forecastZone);
	}

	public get radarImageUrl() {
		return `https://radar.weather.gov/ridge/standard/${this.radarStation}_loop.gif`;
	}

	private extractLastUrlSegment(url: string) {
		const segments = url.split('/');
		return segments[segments.length - 1]!;
	}
}
