import { db } from '@database';
import { injectable } from '@needle-di/core';
import { IncidentStatus } from '@database/models';
import { generateSnowflake } from '@lib/snowflake';
import { and } from '@prisma/orm-postgres/orm-client';
import { parseDuration } from '@depthbomb/common/timing';
import { toInstant, requireRecord, isUniqueViolation } from '@database/values';
import type { IncidentSeverity } from '@database/models';

@injectable()
export class IncidentsService {
	public async isActive(key: string) {
		const count = await db.orm.public.Incident
			.where((f) => and(f.key.eq(key), f.status.eq(IncidentStatus.ACTIVE)))
				.aggregate((a) => ({ count: a.count() }))
				.then((r) => r.count);

		return count > 0;
	}

	public async resolve(key: string) {
		return db.orm.public.Incident.where((f) => and(f.key.eq(key), f.status.eq(IncidentStatus.ACTIVE)))
			.updateAndCount({ status: IncidentStatus.RESOLVED, resolvedAt: toInstant(new Date()) })
			.then((count) => ({ count }));
	}

	public async ensureActiveIncident(
		title: string,
		description: string,
		severity: IncidentSeverity,
		autoResolveDuration = '1 month',
	) {
		return this.getOrCreate(severity, title, description, autoResolveDuration);
	}

	public async getOrCreate(
		severity: IncidentSeverity,
		title: string,
		description: string,
		autoResolveDuration: string,
	) {
		const key = title.toSlug();
		const autoResolveAt = toInstant(parseDuration(autoResolveDuration).fromNow());
		const update = {
			severity,
			description,
			autoResolveAt,
		};

		const activeIncident = await db.orm.public.Incident.where((f) => and(f.key.eq(key), f.status.eq(IncidentStatus.ACTIVE))).first();
		if (activeIncident) {
			return db.orm.public.Incident.where((f) => f.id.eq(activeIncident.id))
				.update(update)
				.then(requireRecord);
		}

		try {
			return await db.orm.public.Incident.create({
				snowflake: generateSnowflake(),
				key: key,
				title: title,
				description: description,
				severity: severity,
				autoResolveAt: toInstant(autoResolveAt),
			});
		} catch (err) {
			if (!isUniqueViolation(err)) {
				throw err;
			}

			// Another caller created the active incident after our initial lookup. Reuse that row
			// instead of surfacing the partial unique-index race to the caller.
			const concurrentIncident = await db.orm.public.Incident.where((f) => and(f.key.eq(key), f.status.eq(IncidentStatus.ACTIVE)))
				.first()
				.then(requireRecord);

			return db.orm.public.Incident.where((f) => f.id.eq(concurrentIncident.id))
				.update(update)
				.then(requireRecord);
		}
	}
}
