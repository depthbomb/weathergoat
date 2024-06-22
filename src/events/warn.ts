import { logger } from '@logger';
import { BaseEvent } from '@events';

export default class WarnEvent extends BaseEvent<'warn'> {
	public constructor() {
		super({ name: 'warn' });
	}

	public async handle(message: string) {
		logger.silly(message);
	}
}
