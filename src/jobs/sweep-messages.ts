import { BaseJob } from '@jobs';
import { SweeperService } from '@services/sweeper';
import { inject, injectable } from '@needle-di/core';

@injectable()
export default class SweepMessagesJob extends BaseJob {
	public constructor(
		private readonly sweeper = inject(SweeperService)
	) {
		super({
			name: 'sweep_messages',
			pattern: '* * * * *',
			runImmediately: true
		});
	}

	public async execute() {
		const [sweepCount, errorCount] = await this.sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			this.logger.withMetadata({ sweepCount, errorCount }).info('Finished sweeping messages');
		}
	}
}
