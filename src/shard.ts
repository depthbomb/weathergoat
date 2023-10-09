import { logger } from '@logger';
import { getOrThrow } from '@config';
import { ShardingManager } from 'discord.js';

const manager = new ShardingManager('./index.js', { token: getOrThrow<string>('bot.token') });

manager.on('shardCreate', shard => {
	const { id, args } = shard;

	logger.info('Shard created', { id, args });
});

manager.spawn();
