import { logger } from '@logger';
import { BaseEvent } from '@events';
import type { Logger } from 'winston';
import type { WeatherGoat } from '@client';

export default class ClientReadyEvent extends BaseEvent<'clientReady'> {
	private readonly logger: Logger;

	public constructor() {
		super({ name: 'clientReady' });

		this.logger = logger.child({ discordEvent: this.name });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this.logger.info('Logged in to Discord', { readyAt });
	}
}
