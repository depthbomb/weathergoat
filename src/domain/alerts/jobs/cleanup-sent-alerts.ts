import { db } from '@database';
import { BaseJob } from '@infra/jobs';

export class CleanupSentAlertsJob extends BaseJob {
	public constructor() {
		super({
			name: CleanupSentAlertsJob.name,
			interval: '1h',
			runImmediately: true
		});
	}

	public async execute() {
		await db.alertDeliveryClaim.deleteMany({
			where: { finalized: true, expiresAt: { lte: new Date() } }
		});
		const { count } = await db.sentAlert.deleteMany({
			where: {
				expiresAt: { lte: new Date() }
			}
		});

		if (count > 0) {
			this.logger.withMetadata({ count }).info('Cleaned up expired sent-alert records');
		}
	}
}
