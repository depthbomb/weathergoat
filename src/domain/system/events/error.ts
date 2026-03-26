import { BaseEvent } from '@infra/events';

export default class ErrorEvent extends BaseEvent<'error'> {
	public constructor() {
		super({ name: 'error' });
	}

	public async handle(error: Error) {
		this.logger.withError(error).error('Error');
	}
}
