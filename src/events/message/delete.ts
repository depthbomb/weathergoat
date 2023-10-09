import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.MessageDelete,
	async handle(message) {
		const { author, partial, guild } = message;

		if (partial) {
			message = await message.fetch();
		}

		logger.info('Message deleted', {
			guild: `${guild?.name} (${guild?.id})`,
			author: author?.displayName,
			message: message.content,
		});
	}
}) satisfies IEvent<Events.MessageDelete>;
