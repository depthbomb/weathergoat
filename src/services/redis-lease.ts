import { RedisService } from './redis';
import { inject, injectable } from '@needle-di/core';

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("del", KEYS[1])
end
return 0
`;

export type RedisLeaseBackend = Pick<RedisService, 'setIfAbsent' | 'evaluate'>;

export class RedisLeaseLostError extends Error {
	public constructor(public readonly key: string, options?: ErrorOptions) {
		super(`Redis lease "${key}" is no longer held by this process.`, options);
		this.name = RedisLeaseLostError.name;
	}
}

export class RedisLease {
	private readonly lostController = new AbortController();
	private state: 'held' | 'lost' | 'released' = 'held';

	public constructor(
		private readonly redis: RedisLeaseBackend,
		public readonly key: string,
		public readonly ownerToken: string,
		public readonly ttlMs: number
	) {}

	public get held() {
		return this.state === 'held';
	}

	public get lost() {
		return this.state === 'lost';
	}

	/** Aborts only when ownership is lost unexpectedly, not after an intentional release. */
	public get lostSignal() {
		return this.lostController.signal;
	}

	public assertHeld() {
		if (!this.held) {
			throw new RedisLeaseLostError(this.key);
		}
	}

	public async renew() {
		this.assertHeld();

		let renewed: unknown;
		try {
			renewed = await this.redis.evaluate(RENEW_SCRIPT, [this.key], [this.ownerToken, this.ttlMs]);
		} catch (cause) {
			throw this.markLost(cause);
		}

		if (renewed !== 1) {
			throw this.markLost();
		}
	}

	public async release() {
		if (this.state === 'released') {
			return false;
		}

		let released: unknown;
		try {
			released = await this.redis.evaluate(RELEASE_SCRIPT, [this.key], [this.ownerToken]);
		} catch (cause) {
			throw this.markLost(cause);
		}

		if (released !== 1) {
			this.markLost();

			return false;
		}

		this.state = 'released';

		return true;
	}

	private markLost(cause?: unknown) {
		const error = new RedisLeaseLostError(this.key, { cause });
		this.state = 'lost';
		if (!this.lostController.signal.aborted) {
			this.lostController.abort(error);
		}

		return error;
	}
}

@injectable()
export class RedisLeaseService {
	public constructor(
		private readonly redis: RedisLeaseBackend = inject(RedisService)
	) {}

	public async acquire(key: string, ttlMs: number, ownerToken: string = crypto.randomUUID()) {
		if (!key) {
			throw new RangeError('Redis lease key must not be empty.');
		}
		if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
			throw new RangeError('Redis lease TTL must be a positive safe integer.');
		}
		if (!ownerToken) {
			throw new RangeError('Redis lease owner token must not be empty.');
		}

		const acquired = await this.redis.setIfAbsent(key, ownerToken, ttlMs);
		if (!acquired) {
			return null;
		}

		return new RedisLease(this.redis, key, ownerToken, ttlMs);
	}
}
