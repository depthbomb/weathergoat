import { BaseEvent } from '@events';
import { logger } from '@lib/logger';

export default class WarnEvent extends BaseEvent<'warn'> {
	public constructor() {
		super({ name: 'warn' });
	}

	public async handle(message: string) {
		logger.silly(message);
	}
}
