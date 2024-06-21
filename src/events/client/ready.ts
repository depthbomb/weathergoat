import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import { captureError } from '@lib/errors';
import type { WeatherGoat } from '@lib/client';

export default class ClientReadyEvent extends BaseEvent<'ready'> {
	public constructor() {
		super({ name: 'ready' });
	}

	public async handle(client: WeatherGoat<true>) {
		const { jobs, readyAt } = client;

		logger.info('Logged in to Discord', { readyAt });

		// Iterate through jobs that should execute or start when the client is ready.
		for (const { job, cron } of jobs.filter(({ job }) => job.waitUntilReady)) {
			if (job.runImmediately) {
				try {
					await job.execute(client, cron);
				} catch (err) {
					captureError('Error in `runImmediately`, `waitUntilReady` job', err, { name: job.name });
				}
			}

			cron.resume();
		}
	}
}
