import { BaseJob } from '@jobs';
import { logger } from '@lib/logger';
import { SweeperService } from '@services/sweeper';
import { inject, injectable } from '@needle-di/core';
import type { Logger } from 'winston';

@injectable()
export default class SweepMessagesJob extends BaseJob {
	private readonly logger: Logger;

	public constructor(
		private readonly sweeper = inject(SweeperService)
	) {
		super({
			name: 'sweep_messages',
			pattern: '* * * * *',
			runImmediately: true
		});

		this.logger = logger.child({ jobName: this.name });
	}

	public async execute() {
		const [sweepCount, errorCount] = await this.sweeper.sweepMessages();
		if (sweepCount || errorCount) {
			this.logger.info('Finished sweeping messages', { sweepCount, errorCount });
		}
	}
}
