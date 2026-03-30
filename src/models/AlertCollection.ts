import { Alert } from '@models/Alert';
import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class AlertCollection {
	@JSONProperty()
	public title!: string;

	@JSONProperty({ type: Date })
	public updated!: Date;

	@JSONProperty({ type: () => Alert, name: '@graph', isArray: true })
	public alerts!: Alert[];

	public get hasAlerts(): boolean {
		return this.alerts.length > 0;
	}
}
