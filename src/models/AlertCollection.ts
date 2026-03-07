import { Alert } from '@models/Alert';
import { Serializable, JSONProperty } from '@depthbomb/serde';

@Serializable()
export class AlertCollection {
	@JSONProperty()
	public title!: string;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public updated!: Date;

	@JSONProperty({ type: () => Alert, name: '@graph', isArray: true })
	public alerts!: Alert[];

	public get hasAlerts(): boolean {
		return this.alerts.length > 0;
	}
}
