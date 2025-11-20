import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { LogLayer } from 'loglayer';
import type { WeatherGoat } from '@lib/client';

export default class ClientReadyEvent extends BaseEvent<'clientReady'> {
	private readonly logger: LogLayer;

	public constructor() {
		super({ name: 'clientReady' });

		this.logger = logger.child().withPrefix(`[Event::${this.name}]`);
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this.logger.withMetadata({ readyAt }).info('Logged in to Discord');
	}
}
