import { Client } from 'discord.js';
import { createCacheOptions } from '../src/lib/cache-options';

// Offline retention benchmark: no login, network requests or production data.
for (let sample = 1; sample <= 3; sample++) {
	for (const bounded of [false, true]) {
		const client = new Client({ intents: [], ...(bounded ? createCacheOptions() : {}) });
		Bun.gc(true);
		const before = process.memoryUsage().heapUsed;
		const start = performance.now();
		const users = client.users as unknown as { _add(data: object): unknown };
		for (let i = 0; i < 50_000; i++) {
			users._add({ id: String(100000000000000000n + BigInt(i)), username: `synthetic-${i}`, discriminator: '0', avatar: null });
		}
		Bun.gc(true);
		console.log(JSON.stringify({ sample, bounded, retainedUsers: client.users.cache.size,
			heapMiB: (process.memoryUsage().heapUsed - before) / 1048576,
			elapsedMs: performance.now() - start }));
		await client.destroy();
	}
}
