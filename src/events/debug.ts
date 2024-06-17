import { BaseEvent } from '@events';
import { logger } from '@lib/logger';

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
