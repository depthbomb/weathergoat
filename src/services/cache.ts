import { Collection } from 'discord.js';
import { Duration } from '@sapphire/time-utilities';
import type { IService } from '@services';

type CacheItem<T> = { value: T; ttl: Duration; };

interface ICacheService extends IService {
	/**
	 * @internal
	 */
	[kStores]: Collection<string, CacheStore>;
	/**
	 * Creates a new cache store.
	 * @param name The name of the cache store.
	 * @param defaultTtl The default TTL of cached items in duration format (for example `1 week`).
	 */
	createStore(name: string, defaultTtl?: string): CacheStore;
	/**
	 * Retrieves an existing cache store.
	 * @param name The name of the cache store.
	 */
	getStore(name: string): CacheStore;
	/**
	 * Retrieves an existing cache store or creates it if it doesn't exist.
	 * @param name The name of the cache store.
	 * @param defaultTtl The default TTL of cached items in duration format (for example `1 week`).
	 */
	getOrCreateStore(name: string, defaultTtl?: string): CacheStore;
}

const kStores = Symbol('stores');

class CacheStore {
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

export const cacheService: ICacheService = ({
	name: 'com.services.cache',

	[kStores]: new Collection(),

	createStore(name: string, defaultTtl?: string) {
		if (this[kStores].has(name)) {
			throw new Error(`Cache store "${name}" already exists`);
		}

		const store = new CacheStore(defaultTtl);

		this[kStores].set(name, store);

		return store;
	},
	getStore(name: string) {
		if (!this[kStores].has(name)) {
			throw new Error(`Cache store "${name}" does not exist`);
		}

		return this[kStores].get(name)!;
	},
	getOrCreateStore(name: string, defaultTtl?: string) {
		if (this[kStores].has(name)) {
			return this[kStores].get(name)!;
		}

		return this.createStore(name, defaultTtl);
	}
});
