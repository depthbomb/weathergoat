import { logger } from '@lib/logger';
import { DiscordEvent } from '@events';

export default class WarnEvent extends DiscordEvent<'warn'> {
	public constructor() {
		super({ name: 'warn', disabled: !process.env.DEV });
	}

	public handle(message: string) {
		logger.warn(message);
	}
}
