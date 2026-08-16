import { db } from '@database';
import { injectable } from '@needle-di/core';
import { generateSnowflake } from '@lib/snowflake';
import { parseDuration } from '@depthbomb/common/timing';
import { Prisma } from '@database/generated/client';
import { IncidentStatus } from '@database/generated/enums';
import type { IncidentSeverity } from '@database/generated/enums';

@injectable()
export class IncidentsService {
	public async isActive(key: string) {
		const count = await db.incident.count({
			where: {
				key,
				status: IncidentStatus.ACTIVE
			}
		});

		return count > 0;
	}

	public async resolve(key: string) {
		return db.incident.updateMany({
			where: {
				key,
				status: IncidentStatus.ACTIVE
			},
			data: {
				status: IncidentStatus.RESOLVED,
				resolvedAt: new Date()
			}
		});
	}

	public async ensureActiveIncident(title: string, description: string, severity: IncidentSeverity, autoResolveDuration = '1 month') {
		return this.getOrCreate(
			severity,
			title,
			description,
			autoResolveDuration
		);
	}

	public async getOrCreate(severity: IncidentSeverity, title: string, description: string, autoResolveDuration: string) {
		const key           = title.toSlug();
		const autoResolveAt = parseDuration(autoResolveDuration).fromNow();
		const update        = {
			severity,
			description,
			autoResolveAt
		};

		const activeIncident = await db.incident.findFirst({
			where: {
				key,
				status: IncidentStatus.ACTIVE
			}
		});
		if (activeIncident) {
			return db.incident.update({
				where: { id: activeIncident.id },
				data: update
			});
		}

		try {
			return await db.incident.create({
				data: {
					snowflake: generateSnowflake(),
					key,
					title,
					description,
					severity,
					autoResolveAt
				}
			});
		} catch (err) {
			if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
				throw err;
			}

			// Another caller created the active incident after our initial lookup. Reuse that row
			// instead of surfacing the partial unique-index race to the caller.
			const concurrentIncident = await db.incident.findFirstOrThrow({
				where: {
					key,
					status: IncidentStatus.ACTIVE
				}
			});

			return db.incident.update({
				where: { id: concurrentIncident.id },
				data: update
			});
		}
	}
}
