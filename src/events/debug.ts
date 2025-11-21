import { env } from '@env';
import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { LogLayer } from 'loglayer';

export default class DebugEvent extends BaseEvent<'debug'> {
	private readonly logger: LogLayer;

	public constructor() {
		super({
			name: 'debug',
			disabled: env.get('MODE') === 'production'
		});

		this.logger = logger.child().withPrefix(`[Event::${this.name}]`);
	}

	public async handle(message: string) {
		this.logger.debug(message);
	}
}
