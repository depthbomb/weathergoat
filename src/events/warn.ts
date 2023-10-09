import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.Warn,
	async handle(message) {
		logger.warn(message);
	},
}) satisfies IEvent<Events.Warn>;
