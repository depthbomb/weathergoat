import { logger } from '@logger';
import { BaseEvent } from '@events';
import type { Logger } from 'winston';

export default class WarnEvent extends BaseEvent<'warn'> {
	private readonly _logger: Logger;

	public constructor() {
		super({ name: 'warn' });

		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(message: string) {
		this._logger.warn(message);
	}
}
