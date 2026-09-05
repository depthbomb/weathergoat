import { Options } from 'discord.js';
import type { ClientOptions } from 'discord.js';

export function createCacheOptions(): Pick<ClientOptions, 'makeCache' | 'sweepers'> {
	return {
		makeCache: Options.cacheWithLimits({
			...Options.DefaultMakeCacheSettings,
			UserManager: {
				maxSize: 1_000,
				keepOverLimit: user => user.id === user.client.user?.id
			},
			GuildMemberManager: {
				maxSize: 200,
				keepOverLimit: member => member.id === member.client.user?.id
			}
		}),
		sweepers: {
			...Options.DefaultSweeperSettings,
			messages: { interval: 300, lifetime: 600 }
		}
	};
}
