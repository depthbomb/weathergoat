import '@extensions/string';
import { expect, test, mock } from 'bun:test';
import { DiscordAPIError } from 'discord.js';
import { UpdateRadarMessagesJob } from './update-radar-messages';
import type { db } from '@database';
import type { WeatherGoat } from '@lib/client';
import type { FeaturesService } from '@services/features';

test('permission failures move out of the due batch so other destinations are reached', async () => {
	const now = Date.now();
	const records = Array.from({ length: 101 }, (_, id) => ({ id, channelId: String(id), nextUpdate: new Date(now - 1000) }));
	const deleted: number[] = [];
	const database = { autoRadarMessage: {
		findMany: async (query: { take: number; orderBy: unknown }) => {
			expect(query.orderBy).toEqual([{ nextUpdate: 'asc' }, { id: 'asc' }]);
			return records.filter(row => row.nextUpdate.getTime() <= Date.now()).slice(0, query.take);
		},
		update: async ({ where, data }: { where: { id: number }; data: { nextUpdate: Date } }) => {
			records[where.id]!.nextUpdate = data.nextUpdate;
		},
		delete: async ({ where }: { where: { id: number } }) => { deleted.push(where.id); }
	} } as unknown as typeof db;
	const job = new UpdateRadarMessagesJob({ isFeatureEnabled: () => false } as unknown as FeaturesService, database);
	const warning = mock(() => {});
	const logger = { withError: () => logger, withMetadata: () => logger, warn: warning };
	Object.defineProperty(job, 'logger', { value: logger });
	const client = { channels: { fetch: async (id: string) => {
		if (id === '100') return null;
		throw new DiscordAPIError({ message: 'Missing Permissions', code: 50013 }, 50013, 403, 'GET', 'https://example.com', {});
	} } } as unknown as WeatherGoat<true>;
	await job.execute(client);
	expect(warning).toHaveBeenCalledTimes(100);
	expect(records[0]!.nextUpdate.getTime()).toBeGreaterThanOrEqual(now + 300_000);
	await job.execute(client);
	expect(deleted).toEqual([100]);
});
