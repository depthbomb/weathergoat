import { logger } from '@lib/logger';
import type { IEvent } from '@events';

interface IClientReadyEvent extends IEvent<'ready'> {}

export const clientReadyEvent: IClientReadyEvent = ({
	name: 'ready',
	handle(client) {
		const { readyAt } = client;

		logger.info('Logged in to Discord', { readyAt });
	},
});
