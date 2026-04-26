import { RelativeLocation } from '@models/RelativeLocation';
import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class Point {
	@JSONProperty()
	public gridX!: number;

	@JSONProperty()
	public gridY!: number;

	@JSONProperty()
	public forecast!: string;

	@JSONProperty()
	public forecastHourly!: string;

	@JSONProperty()
	public forecastGridData!: string;

	@JSONProperty()
	public observationStations!: string;

	@JSONProperty({ type: () => RelativeLocation })
	public relativeLocation!: RelativeLocation;

	@JSONProperty()
	public forecastZone!: string;

	@JSONProperty()
	public county?: string;

	@JSONProperty()
	public fireWeatherZone!: string;

	@JSONProperty()
	public timeZone!: string;

	@JSONProperty()
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

	public get velocityRadarImageUrl() {
		return `https://radar.weather.gov/ridge/standard/base_velocity/${this.radarStation}_loop.gif`;
	}

	private extractLastUrlSegment(url: string) {
		const segments = url.split('/');
		return segments[segments.length - 1]!;
	}
}
