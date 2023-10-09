import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ShardResume,
	async handle(shardId, replayedEvents) {
		logger.info('Shard replaying events', { shardId, replayedEvents })
	},
}) satisfies IEvent<Events.ShardResume>;
