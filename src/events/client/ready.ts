import { BaseEvent } from '@events';
import { tokens } from '@container';
import { logger, reportError } from '@logger';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';
import type { Container } from '@container';

export default class ClientReadyEvent extends BaseEvent<'ready'> {
	private readonly _client: WeatherGoat<true>;
	private readonly _logger: Logger;

	public constructor(container: Container) {
		super({ name: 'ready' });

		this._client = container.resolve(tokens.client);
		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this._logger.info('Logged in to Discord', { readyAt });

		await this._startReadyJobs();
	}

	private async _startReadyJobs() {
		const { jobs } = this._client;
		for (const { job, cron } of jobs.filter(({ job }) => job.waitUntilReady)) {
			if (job.runImmediately) {
				try {
					await job.execute(this._client, cron);
				} catch (err) {
					reportError('Error in `runImmediately`, `waitUntilReady` job', err, { name: job.name });
				}
			}

			cron.resume();
		}
	}
}
