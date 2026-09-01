import { test, expect, describe } from 'bun:test';
import { RedisLeaseService, RedisLeaseLostError } from './redis-lease';
import type { RedisLeaseBackend } from './redis-lease';

class FakeRedis implements RedisLeaseBackend {
	public evaluations = 0;
	public evaluateError?: Error;

	public readonly values = new Map<string, string>();
	public readonly ttls = new Map<string, number>();

	public async setIfAbsent(key: string, value: string, ttlMs: number) {
		if (this.values.has(key)) {
			return false;
		}

		this.values.set(key, value);
		this.ttls.set(key, ttlMs);

		return true;
	}

	public async evaluate(script: string, keys: string[], args: Array<string | number>) {
		this.evaluations++;
		if (this.evaluateError) {
			throw this.evaluateError;
		}

		const key = keys[0]!;
		const ownerToken = String(args[0]);
		if (this.values.get(key) !== ownerToken) {
			return 0;
		}

		if (script.includes('pexpire')) {
			this.ttls.set(key, Number(args[1]));

			return 1;
		}
		if (script.includes('del')) {
			this.values.delete(key);
			this.ttls.delete(key);

			return 1;
		}

		throw new Error('Unexpected script');
	}
}

describe('Redis leases', () => {
	test('acquires once with a unique owner token and configured TTL', async () => {
		const redis = new FakeRedis();
		const service = new RedisLeaseService(redis);

		const lease = await service.acquire('scheduled-job', 30_000, 'worker-a');
		const contender = await service.acquire('scheduled-job', 30_000, 'worker-b');

		expect(lease).not.toBeNull();
		expect(lease!.held).toBeTrue();
		expect(lease!.ownerToken).toBe('worker-a');
		expect(redis.ttls.get('scheduled-job')).toBe(30_000);
		expect(contender).toBeNull();
	});

	test('renews only while the owner token still matches', async () => {
		const redis = new FakeRedis();
		const service = new RedisLeaseService(redis);
		const lease = (await service.acquire('scheduled-job', 30_000, 'worker-a'))!;

		redis.ttls.set('scheduled-job', 1);
		await lease.renew();
		expect(redis.ttls.get('scheduled-job')).toBe(30_000);

		redis.values.set('scheduled-job', 'worker-b');
		await expect(lease.renew()).rejects.toBeInstanceOf(RedisLeaseLostError);
		expect(lease.held).toBeFalse();
		expect(lease.lost).toBeTrue();
		expect(lease.lostSignal.aborted).toBeTrue();
		expect(lease.lostSignal.reason).toBeInstanceOf(RedisLeaseLostError);
	});

	test('releases only its own lease and is idempotent after release', async () => {
		const redis = new FakeRedis();
		const service = new RedisLeaseService(redis);
		const lease = (await service.acquire('scheduled-job', 30_000, 'worker-a'))!;

		expect(await lease.release()).toBeTrue();
		expect(redis.values.has('scheduled-job')).toBeFalse();
		expect(await lease.release()).toBeFalse();
		expect(redis.evaluations).toBe(1);
		expect(lease.lostSignal.aborted).toBeFalse();
	});

	test('does not remove a successor lease after ownership changes', async () => {
		const redis = new FakeRedis();
		const service = new RedisLeaseService(redis);
		const lease = (await service.acquire('scheduled-job', 30_000, 'worker-a'))!;

		redis.values.set('scheduled-job', 'worker-b');

		expect(await lease.release()).toBeFalse();
		expect(redis.values.get('scheduled-job')).toBe('worker-b');
		expect(lease.lostSignal.aborted).toBeTrue();
	});

	test('marks the lease lost when Redis cannot confirm renewal', async () => {
		const redis = new FakeRedis();
		const service = new RedisLeaseService(redis);
		const lease = (await service.acquire('scheduled-job', 30_000, 'worker-a'))!;
		const failure = new Error('connection lost');

		redis.evaluateError = failure;

		let error: unknown;
		try {
			await lease.renew();
		} catch (err) {
			error = err;
		}

		expect(error).toBeInstanceOf(RedisLeaseLostError);
		expect((error as RedisLeaseLostError).cause).toBe(failure);
		expect(lease.lost).toBeTrue();
	});

	test('validates keys, TTLs, and owner tokens before acquisition', async () => {
		const service = new RedisLeaseService(new FakeRedis());

		await expect(service.acquire('', 30_000, 'owner')).rejects.toBeInstanceOf(RangeError);
		await expect(service.acquire('key', 0, 'owner')).rejects.toBeInstanceOf(RangeError);
		await expect(service.acquire('key', 30_000, '')).rejects.toBeInstanceOf(RangeError);
	});
});
