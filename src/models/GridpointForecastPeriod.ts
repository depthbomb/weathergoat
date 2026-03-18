import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class GridpointForecastPeriod {
	@JSONProperty()
	public number!: number;

	@JSONProperty()
	public name!: string;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public startTime!: Date;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public endTime!: Date;

	@JSONProperty()
	public isDayTime!: boolean;

	@JSONProperty()
	public icon!: string;

	@JSONProperty()
	public shortForecast!: string;

	@JSONProperty()
	public detailedForecast!: string;

	public getIcon(size: 'small' | 'medium' | 'large'): string {
		let icon = this.icon;
		if (size !== 'medium') {
			icon = this.icon.replace('medium', size);
		}

		return icon;
	}
}
