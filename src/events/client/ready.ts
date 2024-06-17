import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { Client } from 'discord.js';

export default class ClientReadyEvent extends BaseEvent<'ready'> {
	public constructor() {
		super({ name: 'ready' });
	}

	public async handle(client: Client<true>) {
		const { readyAt } = client;

		logger.info('Logged in to Discord', { readyAt });
	}
}
