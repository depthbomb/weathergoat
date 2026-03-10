import { BaseJob } from '@jobs';
import { SweeperService } from '@services/sweeper';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';

@injectable()
export default class SweepMessagesJob extends BaseJob {
	public constructor(
		private readonly sweeper  = inject(SweeperService),
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: 'sweep_messages',
			pattern: '* * * * *',
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
