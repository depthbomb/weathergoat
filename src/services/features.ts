import { watch } from 'chokidar';
import { logger } from '@lib/logger';
import { Collection } from 'discord.js';
import { exists } from 'node:fs/promises';
import { FEATURES_PATH } from '@constants';
import { createRequire } from 'node:module';
import { plainToInstance } from 'class-transformer';
import type { Maybe } from '#types';
import type { IService } from '@services';
import type { FSWatcher } from 'chokidar';

interface IFeaturesService extends IService {
	[kWatcher]: Maybe<FSWatcher>;
	[kRequire]: NodeRequire;
	[kFeatures]: Collection<string, Feature>;
	loadFeatures(reload: boolean): Promise<void>;
	isFeatureEnabled(name: string, defaultValue?: boolean): boolean;
	get(name: string): () => boolean;
	allFeatures(): Feature[];
}

class Feature {
	public name!: string;
	public fraction!: number;
	public check() {
		return Math.random() < this.fraction;
	}
}

const kWatcher  = Symbol('watcher');
const kFeatures = Symbol('features');
const kRequire  = Symbol('require');

export const featuresService: IFeaturesService = ({
	name: 'com.services.features',

	[kWatcher]: undefined,
	[kRequire]: createRequire(import.meta.url),
	[kFeatures]: new Collection(),

	async init() {
		const featuresFileExists = await exists(FEATURES_PATH);
		if (!featuresFileExists) {
			throw new Error(`Feature Flags config not found at expected path: ${FEATURES_PATH}`);
		}

		await this.loadFeatures(false);

		this[kWatcher] = watch(FEATURES_PATH).on('change', () => this.loadFeatures(true));
	},
	async destroy() {
		await this[kWatcher]?.close();
	},
	async loadFeatures(reload) {
		if (reload) {
			// https://ar.al/2021/02/22/cache-busting-in-node.js-dynamic-esm-imports/#cache-invalidation-in-esm-with-commonjs-style-requires
			delete this[kRequire].cache[FEATURES_PATH];
		}

		logger.info('Loading features...');

		const { features } = this[kRequire](FEATURES_PATH);
		for (const feature of (features as Array<{ name: string; fraction: number; }>)) {
			this[kFeatures].set(feature.name, plainToInstance(Feature, feature));

			logger.info('Loaded feature', { name: feature.name, fraction: feature.fraction });
		}
	},
	get(name) {
		const feature = this[kFeatures].find(f => f.name === name);
		if (!feature) {
			throw new Error(`Feature flag not found: ${name}`);
		}

		return () => feature.check();
	},
	isFeatureEnabled(name, defaultValue) {
		const feature = this[kFeatures].find(f => f.name === name);
		if (!feature) {
			if (typeof defaultValue === 'undefined') {
				throw new Error(`Feature flag not found: ${name}`);
			}

			return defaultValue;
		}

		return feature.check();
	},
	allFeatures() {
		return Array.from(this[kFeatures].values());
	}
});
