import { logger } from '@lib/logger';
import type { IEvent } from '@events';

interface IDebugEvent extends IEvent<'debug'> {}

export const debugEvent: IDebugEvent = ({
	name: 'debug',
	disabled: process.env.MODE === 'production',
	handle(message) {
		logger.silly(message);
	},
});
