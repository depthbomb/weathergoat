import { withQuery } from 'ufo';
import { Type } from 'class-transformer';
import { Geocode } from '@models/Geocode';
import { ALERTS_SEARCH_BASE_URL } from '@constants';
import { AlertReference } from '@models/AlertReference';

export class Alert {
	public id!: string;
	public areaDesc!: string;
	public affectedZones!: string[];
	@Type(() => AlertReference)
	public references!: AlertReference[];
	public geocode!: Geocode;
	@Type(() => Date)
	public sent!: Date;
	@Type(() => Date)
	public effective!: Date;
	@Type(() => Date)
	public expires!: Date;
	@Type(() => Date)
	public ends!: Date;
	public status!: 'Actual' | 'Exercise' | 'System' | 'Test' | 'Draft';
	public messageType!: 'Alert' | 'Update' | 'Cancel' | 'Ack' | 'Error';
	public severity!: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
	public certainty!: 'Unknown' | 'Observed' | 'Likely' | 'Possible' | 'Unlikely';
	public urgency!: 'Unknown' | 'Immediate' | 'Expected' | 'Future' | 'Past';
	public event!: string;
	public sender!: string;
	public senderName!: string;
	public headline!: string;
	public description!: string;
	public instruction?: string;
	public response!: 'Shelter' | 'Evacuate' | 'Prepare' | 'Execute' | 'Avoid' | 'Monitor' | 'Assess' | 'AllClear' | 'None';
	public parameters!: { [key: string]: string[] };

	public get url() {
		return withQuery(ALERTS_SEARCH_BASE_URL, { id: this.id });
	}
}
