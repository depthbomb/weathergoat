import { Geocode } from './Geocode';
import { URLPath } from '@depthbomb/common/url';
import { ALERTS_SEARCH_BASE_URL } from '@constants';
import { AlertReference } from '@models/AlertReference';
import { JSONProperty, Serializable } from '@depthbomb/serde';
import type { Nullable } from '@depthbomb/common/typing';

export enum AlertStatus {
	Actual = 'Actual',
	Exercise = 'Exercise',
	System = 'System',
	Test = 'Test',
	Draft = 'Draft'
}

export enum AlertMessageType {
	Alert = 'Alert',
	Update = 'Update',
	Cancel = 'Cancel',
	Ack = 'Ack',
	Error = 'Error'
}

export enum AlertSeverity {
	Extreme = 'Extreme',
	Severe = 'Severe',
	Moderate = 'Moderate',
	Minor = 'Minor',
	Unknown = 'Unknown'
}

export enum AlertCertainty {
	Unknown = 'Unknown',
	Observed = 'Observed',
	Likely = 'Likely',
	Possible = 'Possible',
	Unlikely = 'Unlikely'
}

export enum AlertUrgency {
	Unknown = 'Unknown',
	Immediate = 'Immediate',
	Expected = 'Expected',
	Future = 'Future',
	Past = 'Past'
}

export enum AlertResponse {
	Shelter = 'Shelter',
	Evacuate = 'Evacuate',
	Prepare = 'Prepare',
	Execute = 'Execute',
	Avoid = 'Avoid',
	Monitor = 'Monitor',
	Assess = 'Assess',
	AllClear = 'AllClear',
	None = 'None'
}

@Serializable()
export class Alert {
	@JSONProperty()
	public id!: string;

	@JSONProperty()
	public areaDesc!: string;

	@JSONProperty({ type: () => Geocode })
	public geocode!: Geocode;

	@JSONProperty()
	public affectedZones!: string[];

	@JSONProperty({ type: () => AlertReference, isArray: true })
	public references!: AlertReference[];

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public sent!: Date;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public effective!: Date;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public expires!: Date;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public ends!: Date;

	@JSONProperty({ type: () => AlertStatus })
	public status!: AlertStatus;

	@JSONProperty({ type: () => AlertMessageType })
	public messageType!: AlertMessageType;

	@JSONProperty({ type: () => AlertSeverity })
	public severity!: AlertSeverity;

	@JSONProperty({ type: () => AlertCertainty })
	public certainty!: AlertCertainty;

	@JSONProperty({ type: () => AlertUrgency })
	public urgency!: AlertUrgency;

	@JSONProperty()
	public event!: string;

	@JSONProperty()
	public sender!: string;

	@JSONProperty()
	public senderName!: string;

	@JSONProperty()
	public headline!: string;

	@JSONProperty()
	public description!: string;

	@JSONProperty({ optional: true })
	public instruction?: string;

	@JSONProperty({ type: () => AlertResponse })
	public response!: AlertResponse;

	@JSONProperty()
	public parameters!: { [key: string]: string[] };

	public get isUpdate() {
		return this.messageType === AlertMessageType.Update;
	}

	public get isNotTest() {
		return this.status !== AlertStatus.Test  &&
			this.status !== AlertStatus.Exercise &&
			this.status !== AlertStatus.Draft;
	}

	public get url() {
		return URLPath.from(ALERTS_SEARCH_BASE_URL).withQuery({ id: this.id }).toString();
	}

	public get expiredReferences(): Nullable<Array<{ sender: string; alertId: string; date: Date; }>> {
		if (Object.hasOwn(this.parameters, 'expiredReferences')) {
			const expiredReferences = this.parameters['expiredReferences'];
			return expiredReferences.map(ref => {
				const parts   = ref.split(',');
				const sender  = parts[0];
				const alertId = parts[1];
				const date    = new Date(parts[2]);

				return { sender, alertId, date };
			});
		}

		return null;
	}
}
