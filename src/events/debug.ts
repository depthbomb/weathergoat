import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { Logger } from 'winston';

export default class DebugEvent extends BaseEvent<'debug'> {
	private readonly logger: Logger;

	public constructor() {
		super({
			name: 'debug',
			disabled: process.env.MODE === 'production'
		});

		this.logger = logger.child({ discordEvent: this.name });
	}

	public async handle(message: string) {
		this.logger.debug(message);
	}
}
