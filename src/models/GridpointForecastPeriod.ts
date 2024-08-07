import { Type } from 'class-transformer';

export class GridpointForecastPeriod {
	public number!: number;
	public name!: string;
	@Type(() => Date)
	public startTime!: Date;
	@Type(() => Date)
	public endTime!: Date;
	public isDayTime!: boolean;
	public icon!: string;
	public shortForecast!: string;
	public detailedForecast!: string;

	public getIcon(size: 'small' | 'medium' | 'large'): string {
		let icon = this.icon;
		if (size !== 'medium') {
			icon = this.icon.replace('medium', size);
		}

		return icon;
	}
}
