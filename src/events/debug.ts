import { logger } from '@lib/logger';
import { DiscordEvent } from '@events';

export default class DebugEvent extends DiscordEvent<'debug'> {
	public constructor() {
		super({ name: 'debug', disabled: !process.env.DEV });
	}

	public handle(message: string) {
		logger.silly(message);
	}
}
