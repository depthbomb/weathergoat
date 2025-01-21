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
	private readonly defaultTtl: string;
	private readonly cache: Collection<string, CacheItem<unknown>>;

	public constructor(options: CacheStoreOptions) {
		this.defaultTtl = options.defaultTtl;
		this.cache      = new Collection();
	}

	public has(key: string) {
		this.tryExpireItem(key);
		return this.cache.has(key);
	}

	public get<T>(key: string) {
		if (!this.has(key)) {
			return null;
		}

		return this.cache.get(key)!.value as T;
	}

	public set<T>(key: string, value: T, ttl?: string) {
		if (this.has(key)) {
			this.cache.delete(key);
		}

		this.cache.set(key, {
			value,
			ttl: new Duration(ttl ?? this.defaultTtl)
		});

		return value;
	}

	private tryExpireItem(key: string) {
		if (!this.cache.has(key)) {
			return;
		}

		const now  = new Date();
		const item = this.cache.get(key)!;
		if (item.ttl.fromNow <= now) {
			this.cache.delete(key);
		}
	}
}

export default class CacheService implements ICacheService {
	private readonly _stores: Collection<string, CacheStore>;

	public constructor() {
		this._stores = new Collection();
	}

	public getStore(name: string, options?: GetCacheStoreOptions) {
		return this._stores.ensure(name, () => new CacheStore({
			defaultTtl: options?.defaultTtl ?? '99 years'
		}));
	}
}
