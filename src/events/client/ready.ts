import { BaseEvent } from '@events';
import { logger, reportError } from '@logger';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';

export default class ClientReadyEvent extends BaseEvent<'ready'> {
	private readonly _logger: Logger;

	public constructor() {
		super({ name: 'ready' });

		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(client: WeatherGoat<true>) {
		const { jobs, readyAt } = client;

		this._logger.info('Logged in to Discord', { readyAt });

		// Iterate through jobs that should execute or start when the client is ready.
		for (const { job, cron } of jobs.filter(({ job }) => job.waitUntilReady)) {
			if (job.runImmediately) {
				try {
					await job.execute(client, cron);
				} catch (err) {
					reportError('Error in `runImmediately`, `waitUntilReady` job', err, { name: job.name });
				}
			}

			cron.resume();
		}
	}
}
