import { env } from '@env';
import { RedisClient } from 'bun';
import { injectable } from '@needle-di/core';
import { parseDuration } from '@depthbomb/common/timing';

@injectable()
export class RedisService {
	private readonly prefix: string;
	private readonly client: RedisClient;

	public constructor() {
		this.prefix = env.get('REDIS_PREFIX');
		this.client = new RedisClient(env.get('REDIS_URL'));
	}

	public async get(key: string) {
		return this.client.get(
			this.getPrefixedKey(key)
		);
	}

	public async set(key: string, value: unknown, ttl?: string) {
		if (ttl) {
			const duration = parseDuration(ttl);
			return this.client.set(
				this.getPrefixedKey(key),
				value,
				'PX',
				duration.milliseconds
			);
		}

		return this.client.set(
			this.getPrefixedKey(key),
			value
		);
	}

	public async has(key: string) {
		return this.client.exists(
			this.getPrefixedKey(key)
		);
	}

	public async setIfAbsent(key: string, value: string, ttlMs: number) {
		if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
			throw new RangeError('Redis TTL must be a positive safe integer.');
		}

		const result = await this.client.set(
			this.getPrefixedKey(key),
			value,
			'NX',
			'PX',
			String(ttlMs)
		);

		return result === 'OK';
	}

	public async evaluate(script: string, keys: string[], args: Array<string | number> = []) {
		const prefixedKeys = keys.map(key => this.getPrefixedKey(key));

		return this.client.eval(
			script,
			prefixedKeys.length,
			...prefixedKeys,
			...args
		);
	}

	public close() {
		this.client.close();
	}

	private getPrefixedKey(key: string) {
		return `${this.prefix}:${key}`
	}
}
