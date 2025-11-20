import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { LogLayer } from 'loglayer';

export default class WarnEvent extends BaseEvent<'warn'> {
	private readonly logger: LogLayer;

	public constructor() {
		super({ name: 'warn' });

		this.logger = logger.child().withPrefix(`[Event::${this.name}]`);
	}

	public async handle(message: string) {
		this.logger.warn(message);
	}
}
