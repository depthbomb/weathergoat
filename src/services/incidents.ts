import { db } from '@database';
import { logger } from '@lib/logger';
import { injectable } from '@needle-di/core';
import { generateSnowflake } from '@lib/snowflake';
import { parseDuration } from '@depthbomb/common/timing';
import { IncidentStatus } from '@database/generated/enums';
import type { IncidentSeverity } from '@database/generated/enums';

@injectable()
export class IncidentsService {
	private readonly logger = logger.child().withPrefix(IncidentsService.name.bracketWrap());

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

		return db.incident.upsert({
			where: {
				key_status: {
					key,
					status: IncidentStatus.ACTIVE
				}
			},
			update: {
				severity,
				description,
				autoResolveAt
			},
			create: {
				snowflake: generateSnowflake(),
				key,
				title,
				description,
				severity,
				autoResolveAt
			}
		});
	}
}
