import { db } from '@database';
import { BaseJob } from '@infra/jobs';
import { toInstant } from '@database/values';
import { and } from '@prisma/orm-postgres/orm-client';

export class CleanupSentAlertsJob extends BaseJob {
	public constructor() {
		super({
			name: CleanupSentAlertsJob.name,
			interval: '1h',
			runImmediately: true,
		});
	}

	public async execute() {
		await db.orm.public.AlertDeliveryClaim.where((f) =>
				and(f.finalized.eq(true), f.expiresAt.lte(toInstant(new Date()))))
				.deleteAndCount()
				.then((count) => ({ count }));
		const { count } = await db.orm.public.SentAlert.where((f) => f.expiresAt.lte(toInstant(new Date())))
			.deleteAndCount()
			.then((count) => ({ count }));
		if (count > 0) {
			this.logger.withMetadata({ count }).info('Cleaned up expired sent-alert records');
		}
	}
}
