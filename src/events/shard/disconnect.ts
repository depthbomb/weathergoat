import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.ShardDisconnect,
	async handle(closeEvent, shardId) {
		const { code } = closeEvent;

		logger.info('Shard disconnected', { shardId, code });
	},
}) satisfies IEvent<Events.ShardDisconnect>;
