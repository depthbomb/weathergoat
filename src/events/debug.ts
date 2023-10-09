import { flags } from '@flags';
import { Events } from 'discord.js';
import { logger } from '@logger';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.Debug,
	disabled: !flags.dev,
	async handle(message) {
		logger.debug(message);
	},
}) satisfies IEvent<Events.Debug>;
