import { BaseEvent } from '@events';
import type { WeatherGoat } from '@lib/client';

export default class ClientReadyEvent extends BaseEvent<'clientReady'> {
	public constructor() {
		super({ name: 'clientReady' });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this.logger.withMetadata({ readyAt }).info('Logged in to Discord');
	}
}
