import { logger } from '@lib/logger';
import type { IEvent } from '@events';

interface IWarnEvent extends IEvent<'warn'> {}

export const warnEvent: IWarnEvent = ({
	name: 'warn',
	handle(message) {
		logger.warn(message);
	},
});
