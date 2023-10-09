import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ShardReconnecting,
	async handle(shardId) {
		logger.info('Shard reconnecting', { shardId });
	},
}) satisfies IEvent<Events.ShardReconnecting>;
