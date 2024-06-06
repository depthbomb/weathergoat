import { Collection } from 'discord.js';
import { Duration } from '@sapphire/time-utilities';

type CacheItem<T> = { value: T; ttl: Duration; };

export class CacheStore {
	private readonly _ttl: string;
	private readonly _cache: Map<string, CacheItem<unknown>>;

	public constructor(ttl: string = '1 year') {
		this._ttl   = ttl;
		this._cache = new Map();
	}

	public has(key: string): boolean {
		this._tryExpireItem(key);
		return this._cache.has(key);
	}

	public get<T>(key: string): T | null {
		if (!this.has(key)) {
			return null;
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

export class CacheService {
	private readonly _stores: Collection<string, CacheStore>;

	public constructor() {
		this._stores = new Collection();
	}

	public createStore(name: string, defaultTtl?: string) {
		if (this._stores.has(name)) {
			throw new Error(`Cache store "${name}" already exists`);
		}

		const store = new CacheStore(defaultTtl);

		this._stores.set(name, store);

		return store;
	}

	public getStore(name: string) {
		if (!this._stores.has(name)) {
			throw new Error(`Cache store "${name}" does not exist`);
		}

		return this._stores.get(name)!;
	}

	public getOrCreateStore(name: string, defaultTtl?: string) {
		if (this._stores.has(name)) {
			return this._stores.get(name)!;
		}

		return this.createStore(name, defaultTtl);
	}
}
