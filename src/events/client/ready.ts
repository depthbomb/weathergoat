import { logger } from '@lib/logger';
import { DiscordEvent } from '@events';
import type { Client } from 'discord.js';

export default class ReadyEvent extends DiscordEvent<'ready'> {
	public constructor() {
		super({ name: 'ready' });
	}

	public handle(client: Client<true>) {
		logger.info('Logged in to Discord');
	}
}
