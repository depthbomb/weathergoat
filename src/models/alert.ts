import { Geocode } from './geocode';
import { Type } from 'class-transformer';

export class Alert {
	public id!: string;
	public areaDesc!: string;
	public affectedZones!: string[];
	public gecode!: Geocode;
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
	public senderName!: string;
	public headline!: string;
	public description!: string;
	public instructions!: string;
	public response!: 'Shelter' | 'Evacuate' | 'Prepare' | 'Execute' | 'Avoid' | 'Monitor' | 'Assess' | 'AllClear' | 'None';
}
