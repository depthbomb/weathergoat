import { Duration } from '@sapphire/time-utilities';

type CacheItem = {
	value: unknown;
	ttl: Duration;
}

export class Cache {
	private readonly _ttl: string;
	private readonly _max: number;
	private readonly _cache: Map<string, CacheItem>;

	public constructor(ttl: string = '1 year', max: number = Infinity) {
		this._ttl   = ttl;
		this._max   = max;
		this._cache = new Map<string, CacheItem>();
	}

	public has(key: string): boolean {
		this._tryExpireItem(key);
		return this._cache.has(key);
	}

	public get<T>(key: string): T | undefined {
		if (!this.has(key)) {
			return;
		}

		return this._cache.get(key)!.value as T;
	}

	public set<T>(key: string, value: T): T {
		if (this.has(key)) {
			this._cache.delete(key);
		}

		const ttl = new Duration(this._ttl);

		this._cache.set(key, { value, ttl });

		return value;
	}

	private _tryExpireItem(key: string): void {
		if (!this._cache.has(key)) return;

		const now  = new Date();
		const item = this._cache.get(key)!;
		if (item.ttl.fromNow <= now) {
			this._cache.delete(key);
		}
	}
}
