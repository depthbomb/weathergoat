import { YAML } from 'bun';
import { Collection } from 'discord.js';
import { injectable } from '@needle-di/core';
import { dirname, basename } from 'node:path';
import { watch, readFileSync } from 'node:fs';
import { logger, reportError } from '@lib/logger';
import { FEATURE_FLAGS, FEATURES_FILE } from '@constants';
import type { FSWatcher } from 'node:fs';
import type { LogLayer } from 'loglayer';

export type FeatureName = typeof FEATURE_FLAGS[number];
export type FeatureConfig = {
	description: string;
	enabled: boolean;
	rolloutPercentage: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFeatureConfig(yaml: string) {
	const parsed = YAML.parse(yaml) as unknown;
	if (!isRecord(parsed)) {
		throw new TypeError('Feature configuration must be an object.');
	}

	const configs = new Map<FeatureName, FeatureConfig>();
	for (const name of FEATURE_FLAGS) {
		const value = parsed[name];
		if (!isRecord(value)) {
			throw new TypeError(`Missing or invalid feature configuration: ${name}`);
		}
		if (typeof value.description !== 'string' || value.description.trim().length === 0) {
			throw new TypeError(`Feature "${name}" must have a non-empty description.`);
		}
		if (typeof value.enabled !== 'boolean') {
			throw new TypeError(`Feature "${name}" must have a boolean enabled value.`);
		}
		if (typeof value.rolloutPercentage !== 'number' || !Number.isFinite(value.rolloutPercentage) || value.rolloutPercentage < 0 || value.rolloutPercentage > 100) {
			throw new RangeError(`Feature "${name}" rollout percentage must be between 0 and 100.`);
		}

		configs.set(name, {
			description: value.description,
			enabled: value.enabled,
			rolloutPercentage: value.rolloutPercentage
		});
	}

	return configs;
}

class Feature {
	public constructor(
		public readonly name: FeatureName,
		public readonly description: string,
		public readonly enabled: boolean,
		public readonly rolloutPercentage: number,
	) { }

	public check() {
		if (!this.enabled) {
			return false;
		}

		return (Math.random() * 100) < this.rolloutPercentage;
	}
}

@injectable()
export class FeaturesService {
	private readonly logger: LogLayer;
	private readonly watcher: FSWatcher;
	private features: Collection<FeatureName, Feature>;

	public constructor() {
		this.logger   = logger.child().withPrefix(FeaturesService.name.bracketWrap());
		this.features = new Collection();
		this.reloadFeatures(true);

		const featuresFileName = basename(FEATURES_FILE);
		this.watcher = watch(dirname(FEATURES_FILE), (_event, filename) => {
			if (filename && filename.toString() !== featuresFileName) {
				return;
			}

			this.logger.debug('Features config changed');
			this.reloadFeatures();
		});
	}

	public get(name: FeatureName) {
		return this.features.get(name);
	}

	public isFeatureEnabled(name: FeatureName, defaultValue?: boolean) {
		const feature = this.features.get(name);

		if (!feature) {
			if (defaultValue === undefined) {
				throw new Error(`Feature flag not found: ${name}`);
			}

			return defaultValue;
		}

		return feature.check();
	}

	public all() {
		return Array.from(this.features.values()).map(f => ({
			name: f.name,
			description: f.description,
			enabled: f.enabled,
			rolloutPercentage: f.rolloutPercentage
		}));
	}

	public closeWatcher() {
		this.watcher.close();
	}

	private reloadFeatures(throwOnError = false) {
		try {
			const yaml         = readFileSync(FEATURES_FILE, 'utf8');
			const configs      = parseFeatureConfig(yaml);
			const nextFeatures = new Collection<FeatureName, Feature>();

			for (const [name, config] of configs) {
				nextFeatures.set(name, new Feature(name, config.description, config.enabled, config.rolloutPercentage));
			}

			this.features = nextFeatures;
			for (const [name, config] of configs) {
				this.logger.withMetadata({ name, ...config }).debug('Loaded feature');
			}
		} catch (err) {
			reportError('Failed to parse features.yaml', err);
			this.logger.withError(err).withMetadata({ FEATURES_FILE }).error('Failed to parse features.yaml');

			if (throwOnError) {
				throw err;
			}
		}
	}
}
