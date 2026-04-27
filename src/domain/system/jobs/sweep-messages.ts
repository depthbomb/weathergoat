import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { SweeperService } from '@services/sweeper';
import { FeaturesService } from '@services/features';

export class SweepMessagesJob extends BaseJob {
	public constructor(
		private readonly sweeper  = inject(SweeperService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: SweepMessagesJob.name,
			interval: '1m',
			runImmediately: true
		});
	}

	public async execute() {
		if (this.features.isFeatureEnabled('disableMessageSweeping')) {
			return;
		}

		const [sweepCount, errorCount] = await this.sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			this.logger.withMetadata({ sweepCount, errorCount }).info('Finished sweeping messages');
		}
	}
}
