import { env } from '@env';
import { BaseEvent } from '@infra/events';

export class DebugEvent extends BaseEvent<'debug'> {
	public constructor() {
		super({
			name: 'debug',
			disabled: env.get('MODE') === 'production'
		});
	}

	public async handle(message: string) {
		this.logger.debug(message);
	}
}
