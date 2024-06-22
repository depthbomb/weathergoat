import { logger } from '@logger';
import { BaseEvent } from '@events';

export default class DebugEvent extends BaseEvent<'debug'> {
	public constructor() {
		super({
			name: 'debug',
			disabled: process.env.MODE === 'production'
		});
	}

	public async handle(message: string) {
		logger.silly(message);
	}
}
