import { logger } from '@logger';
import { BaseEvent } from '@events';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';

export default class ClientReadyEvent extends BaseEvent<'ready'> {
	private readonly _logger: Logger;

	public constructor() {
		super({ name: 'ready' });

		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this._logger.info('Logged in to Discord', { readyAt });
	}
}
