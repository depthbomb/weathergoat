import { Collection} from 'discord.js';
import { Duration } from '@sapphire/time-utilities';
import type { IService } from '@services';

type CacheItem<T> = { value: T; ttl: Duration; };
type CacheStoreOptions = {
	/**
	 * The default _time to live_ for stored items. Attempting to retrieve an item passed its
	 * time to live will result in it being removed from the cache and `null` being returned.
	 */
	defaultTtl: string;
};
type GetCacheStoreOptions = Omit<CacheStoreOptions, 'defaultTtl'> & {
	/**
	 * The default _time to live_ for stored items. Attempting to retrieve an item passed its
	 * time to live will result in it being removed from the cache and `null` being returned.
	 *
	 * @default '99 years'
	 */
	defaultTtl?: string;
};

export interface ICacheService extends IService {
	/**
	 * Returns a cache store.
	 *
	 * @param name The name of the cache store.
	 *
	 * @remarks
	 *
	 * If a store does not exist by the provided {@link name} then it is created.
	 */
	getStore(name: string, options?: GetCacheStoreOptions): CacheStore;
}

export class CacheStore {
	private readonly _ttl?: string;
	private readonly _cache: Collection<string, CacheItem<unknown>>;

	public constructor(ttl: string) {
		this._ttl   = ttl;
		this._cache = new Collection();
	}

	public has(key: string) {
		this._tryExpireItem(key);
		return this._cache.has(key);
	}

	public get<T>(key: string) {
		if (!this.has(key)) {
			return null;
		}

		return this._cache.get(key)!.value as T;
	}

	public set<T>(key: string, value: T) {
		if (this.has(key)) {
			this._cache.delete(key);
		}

		const ttl = new Duration(this._ttl ?? '99 years');

		this._cache.set(key, { value, ttl });

		return value;
	}

	private _tryExpireItem(key: string) {
		if (!this._cache.has(key)) {
			return;
		}

		const now  = new Date();
		const item = this._cache.get(key)!;
		if (item.ttl.fromNow <= now) {
			this._cache.delete(key);
		}
	}
}

export default class CacheService implements ICacheService {
	private readonly _stores: Collection<string, CacheStore>;

	public constructor() {
		this._stores = new Collection();
	}

	public getStore(name: string, options?: GetCacheStoreOptions) {
		return this._stores.ensure(name, () => new CacheStore(options?.defaultTtl ?? '99 years'));
	}
}
