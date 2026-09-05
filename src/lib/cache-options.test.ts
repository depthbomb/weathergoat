import { Client, User, GuildMember } from 'discord.js';
import { expect, test } from 'bun:test';
import { createCacheOptions } from './cache-options';

test('user and member caches stay bounded while retaining the bot', async () => {
	const client = new Client({ intents: [], ...createCacheOptions() });
	Object.defineProperty(client, 'user', { value: { id: 'bot' } });
	try {
		for (const [manager, holds, size] of [['UserManager', User, 1000], ['GuildMemberManager', GuildMember, 200]] as const) {
			const factory = client.options.makeCache! as unknown as (
				manager: { name: string }, holds: unknown, actual: { name: string }
			) => Map<string, { id: string; client: Client }>;
			const cache = factory({ name: manager }, holds, { name: manager });
			cache.set('bot', { id: 'bot', client });
			for (let i = 0; i < size * 2; i++) cache.set(String(i), { id: String(i), client });
			expect(cache.size).toBe(size);
			expect(cache.has('bot')).toBeTrue();
		}
	} finally {
		await client.destroy();
	}
});
