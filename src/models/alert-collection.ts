import { Alert } from './alert';
import { Type, Expose } from 'class-transformer';

export class AlertCollection {
	public title!: string;
	@Type(() => Date)
	public updated!: Date;
	@Type(() => Alert)
	@Expose({ name: '@graph' })
	public alerts!: Alert[];
}
