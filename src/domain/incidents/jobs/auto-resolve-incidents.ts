import { db } from '@database';
import { BaseJob } from '@infra/jobs';
import { toInstant } from '@database/values';
import { IncidentStatus } from '@database/models';
import { and } from '@prisma/orm-postgres/orm-client';

export class AutoResolveIncidentsJob extends BaseJob {
	public constructor() {
		super({
			name: AutoResolveIncidentsJob.name,
			interval: '30s',
			runImmediately: true,
		});
	}

	public async execute() {
		await db.orm.public.Incident.where((f) =>
			and(f.status.eq(IncidentStatus.ACTIVE), f.autoResolveAt.lte(toInstant(new Date()))))
				.updateAndCount({ status: IncidentStatus.RESOLVED, resolvedAt: toInstant(new Date()) })
				.then((count) => ({ count }));
	}
}
