import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ShardError,
	async handle(error, shardId) {
		logger.error('Shard error', { shardId, error });
	},
}) satisfies IEvent<Events.ShardError>;
