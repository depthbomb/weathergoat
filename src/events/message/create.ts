import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.MessageCreate,
	async handle(message) {
		const { author, partial, guild } = message;

		if (author.bot || author.system) {
			return;
		}

		if (partial) {
			message = await message.fetch();
		}

		logger.info('Received message', {
			guild: `${guild?.name} (${guild?.id})`,
			author: author.displayName,
			message: message.content,
		});
	},
}) satisfies IEvent<Events.MessageCreate>;
