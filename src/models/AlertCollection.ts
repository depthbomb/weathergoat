import { Alert } from '@models/Alert';
import { Type, Expose } from 'class-transformer';

export class AlertCollection {
	public title!: string;
	@Type(() => Date)
	public updated!: Date;
	@Type(() => Alert)
	@Expose({ name: '@graph' })
	public alerts!: Alert[];

	public get hasAlerts(): boolean {
		return this.alerts.length > 0;
	}
}
