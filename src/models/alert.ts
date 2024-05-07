import { Type } from 'class-transformer';
import { Geocode } from '@models/geocode';
import type { ColorResolvable } from 'discord.js';

export class Alert {
	public id!: string;
	public areaDesc!: string;
	public affectedZones!: string[];
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
	public senderName!: string;
	public headline!: string;
	public description!: string;
	public instruction?: string;
	public response!: 'Shelter' | 'Evacuate' | 'Prepare' | 'Execute' | 'Avoid' | 'Monitor' | 'Assess' | 'AllClear' | 'None';
	public parameters!: { [key: string]: string[] };

	public get severityColor(): ColorResolvable {
		switch (this.severity) {
			default:
			case 'Unknown':
				return '#9ca3af';
			case 'Minor':
				return '#fbbf24';
			case 'Moderate':
				return '#f97316';
			case 'Severe':
				return '#dc2626';
			case 'Extreme':
				return '#7f1d1d';
		}
	}
}
