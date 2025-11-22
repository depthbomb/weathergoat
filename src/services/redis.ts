import { env } from '@env';
import { RedisClient } from 'bun';
import { injectable } from '@needle-di/core';
import { Duration } from '@sapphire/duration';

@injectable()
export class RedisService {
	private readonly prefix: string;
	private readonly client: RedisClient;

	public constructor() {
		this.prefix = env.get('REDIS_PREFIX') ?? 'wg';
		this.client = new RedisClient(env.get('REDIS_URL'));
	}

	public async get(key: string) {
		return this.client.get(
			this.getPrefixedKey(key)
		);
	}

	public async set(key: string, value: unknown, ttl?: string) {
		if (ttl) {
			const duration = new Duration(ttl);
			return this.client.set(
				this.getPrefixedKey(key),
				value,
				'PX',
				duration.offset
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

	public close() {
		this.client.close();
	}

	private getPrefixedKey(key: string) {
		return `${this.prefix}:${key}`
	}
}
