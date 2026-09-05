import { expect, test } from 'bun:test';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscordAPIError } from 'discord.js';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@database/generated/client';
import { AlertDeliveryService } from './alert-delivery';
import type { db } from '@database';

test('durable alert claims recover bookkeeping failures without repeating sends', async () => {
	if (!process.env.WEATHERGOAT_DELIVERY_TEST_DIR) {
		const directory = await mkdtemp(join(tmpdir(), 'weathergoat-delivery-'));
		try {
			// libsql native handles can outlive $disconnect on Windows. Run the
			// real SQLite integration in a child, then remove its DB after exit.
			const child = Bun.spawn([process.execPath, 'test', import.meta.path], {
				env: { ...process.env, WEATHERGOAT_DELIVERY_TEST_DIR: directory },
				stdout: 'pipe', stderr: 'pipe'
			});
			const [code, stdout, stderr] = await Promise.all([
				child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
			]);
			if (code !== 0) throw new Error(stdout + stderr);
			expect(code).toBe(0);
		} finally {
			await rm(directory, { recursive: true, maxRetries: 5, retryDelay: 100 });
		}
		return;
	}
	const directory = process.env.WEATHERGOAT_DELIVERY_TEST_DIR;
	const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
	const adapter = new PrismaLibSql({ url });
	const sql = adapter.createClient({ url });
	adapter.createClient = () => sql;
	const migrations = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));
	const entries = (await readdir(migrations, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
	let database: PrismaClient | undefined;
	try {
		for (const entry of entries) {
			const migration = Bun.file(join(migrations, entry.name, 'migration.sql'));
			if (!await migration.exists()) continue;
			if (entry.name === '20260905013000_alert_delivery_claims') {
				// Preserve a representative existing row while applying the additive migration.
				await sql.executeMultiple(`INSERT INTO SentAlert (alertId, guildId, channelId, messageId, expiresAt) VALUES ('old', 'g', 'c', 'old-message', '2099-01-01');`);
			}
			await sql.executeMultiple(await migration.text());
		}
		expect((await sql.execute({ sql: 'SELECT messageId FROM SentAlert WHERE alertId = ?', args: ['old'] })).rows[0]?.messageId).toBe('old-message');
		database = new PrismaClient({ adapter });
		const store = database as unknown as typeof db;
		let service = new AlertDeliveryService(store);
		const data = { alertId: 'cleanup-failure', guildId: 'g', channelId: 'c', expiresAt: new Date(Date.now() + 3600_000), autoCleanup: true };
		let sends = 0;
		const send = async () => ({ id: `message-${++sends}` });

		// A cleanup failure must roll back bookkeeping, retaining a durable receipt.
		await sql.executeMultiple(`CREATE TRIGGER fail_cleanup BEFORE INSERT ON VolatileMessage BEGIN SELECT RAISE(ABORT, 'temporary cleanup failure'); END;`);
		await expect(service.deliver(data, send)).rejects.toThrow();
		expect(await database.sentAlert.count({ where: { alertId: data.alertId } })).toBe(0);
		expect((await database.alertDeliveryClaim.findFirstOrThrow()).messageId).toBe('message-1');
		await sql.executeMultiple('DROP TRIGGER fail_cleanup;');
		service = new AlertDeliveryService(store); // Simulated process restart.
		await service.recover();
		await service.deliver(data, send);
		expect(sends).toBe(1);
		expect(await database.volatileMessage.count()).toBe(1);
		expect(await database.sentAlert.count({ where: { alertId: data.alertId } })).toBe(1);

		// Concurrent attempts share one durable claim, even with separate service instances.
		await Promise.all([
			service.deliver({ ...data, alertId: 'concurrent' }, send),
			new AlertDeliveryService(store).deliver({ ...data, alertId: 'concurrent' }, send)
		]);
		expect(sends).toBe(2);

		// If receipt persistence fails, the live process retries it without sending again.
		await sql.executeMultiple(`CREATE TRIGGER fail_receipt BEFORE UPDATE OF messageId ON AlertDeliveryClaim BEGIN SELECT RAISE(ABORT, 'temporary receipt failure'); END;`);
		await expect(service.deliver({ ...data, alertId: 'receipt-failure' }, send)).rejects.toThrow();
		await sql.executeMultiple('DROP TRIGGER fail_receipt;');
		await service.recover();
		await service.deliver({ ...data, alertId: 'receipt-failure' }, send);
		expect(sends).toBe(3);

		// Unknown send outcomes remain blocked after restart instead of duplicating.
		await expect(service.deliver({ ...data, alertId: 'ambiguous' }, async () => {
			sends++;
			throw new TypeError('connection lost after send');
		})).rejects.toThrow();
		await new AlertDeliveryService(store).deliver({ ...data, alertId: 'ambiguous' }, send);
		expect(sends).toBe(4);

		// Definitive API rejections release the claim; expired alerts never send.
		await expect(service.deliver({ ...data, alertId: 'rejected' }, async () => {
			throw new DiscordAPIError({ message: 'Missing Permissions', code: 50013 }, 50013, 403, 'POST', 'https://example.com', {});
		})).rejects.toThrow();
		await service.deliver({ ...data, alertId: 'rejected', autoCleanup: false }, send);
		expect(sends).toBe(5);
		await service.deliver({ ...data, alertId: 'expired', expiresAt: new Date(0) }, send);
		expect(sends).toBe(5);
		expect((await sql.execute('PRAGMA integrity_check')).rows[0]?.integrity_check).toBe('ok');
	} finally {
		await database?.$disconnect();
		sql.close();
	}
}, 30_000);
