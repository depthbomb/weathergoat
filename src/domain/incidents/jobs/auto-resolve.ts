import { db } from '@database';
import { BaseJob } from '@infra/jobs';
import { IncidentStatus } from '@database/generated/enums';

export default class AutoResolveJob extends BaseJob {
	public constructor() {
		super({
			name: AutoResolveJob.name,
			pattern: '* * * * *',
			runImmediately: true
		});
	}

	public async execute() {
		await db.incident.updateMany({
			where: {
				status: IncidentStatus.ACTIVE,
				autoResolveAt: {
					lte: new Date()
				}
			},
			data: {
				status: IncidentStatus.RESOLVED,
				resolvedAt: new Date()
			}
		});
	}
}
