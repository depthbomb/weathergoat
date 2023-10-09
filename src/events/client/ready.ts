import { Events } from 'discord.js';
import { logger } from '@logger';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ClientReady,
	once: true,
	async handle() {
		logger.info('Ready');
	},
}) satisfies IEvent<Events.ClientReady>;
