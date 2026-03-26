import { BaseEvent } from '@infra/events';

export default class WarnEvent extends BaseEvent<'warn'> {
	public constructor() {
		super({ name: 'warn' });
	}

	public async handle(message: string) {
		this.logger.warn(message);
	}
}
