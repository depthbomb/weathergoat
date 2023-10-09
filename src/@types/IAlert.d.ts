import type { AlertStatus } from './AlertStatus';
import type { AlertUrgency } from './AlertUrgency';
import type { AlertSeverity } from './AlertSeverity';
import type { AlertResponse } from './AlertResponse';
import type { AlertCertainty } from './AlertCertainty';
import type { AlertMessageType } from './AlertMessageType';

export interface IAlert {
	id:            string;
	areaDesc:      string;
	affectedZones: string[];
	geocode: {
		SAME: string[];
		UGC: string[];
	};
	sent:         string;
	effective:    string;
	expires:      string;
	ends:         string;
	status:       AlertStatus;
	messageType:  AlertMessageType;
	severity:     AlertSeverity;
	certainty:    AlertCertainty;
	urgency:      AlertUrgency;
	event:        string;
	senderName:   string;
	headline:     string;
	description:  string;
	instructions: string;
	response:     AlertResponse;
}
