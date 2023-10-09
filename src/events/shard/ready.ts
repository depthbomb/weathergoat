import { Events } from 'discord.js';
import { logger } from '@logger';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ShardReady,
	async handle(shardId, unavailableGuilds) {
		logger.info('Shard ready', { shardId, unavailableGuilds });
	},
}) satisfies IEvent<Events.ShardReady>;
