import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.Error,
	async handle(error) {
		logger.prettyError(error);
	},
}) satisfies IEvent<Events.Error>;
