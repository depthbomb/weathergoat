import { YAML } from 'bun';
import { Collection } from 'discord.js';
import { injectable } from '@needle-di/core';
import { watch, readFileSync } from 'node:fs';
import { logger, reportError } from '@lib/logger';
import { FEATURE_FLAGS, FEATURES_FILE } from '@constants';
import type { FSWatcher } from 'node:fs';
import type { LogLayer } from 'loglayer';

type FeatureName = typeof FEATURE_FLAGS[number];
type FeatureConfig = {
	description: string;
	enabled: boolean;
	rolloutPercentage: number;
};

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
	private readonly features: Collection<FeatureName, Feature>;

	public constructor() {
		this.logger   = logger.child().withPrefix(FeaturesService.name.bracketWrap());
		this.features = new Collection();

		this.watcher = watch(FEATURES_FILE, (event) => {
			if (event === 'change') {
				this.logger.debug('Features config changed');
				this.parseFeatures();
			}
		});

		this.parseFeatures();
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

	private parseFeatures() {
		this.features.clear();

		const yaml = readFileSync(FEATURES_FILE, 'utf8');
		try {
			const parsed = YAML.parse(yaml) as Record<'default' | FeatureName, FeatureConfig>;
			for (const [key, value] of Object.entries(parsed)) {
				if (FEATURE_FLAGS.some(f => f === key)) {
					const name = key as FeatureName;
					const feature = new Feature(
						name,
						value.description,
						value.enabled,
						value.rolloutPercentage
					);

					this.features.set(name, feature);

					this.logger.withMetadata({ ...value }).debug('Loaded features');
				}
			}
		} catch (err) {
			reportError('Failed to parse features.yaml', err);
			this.logger.withError(err).withMetadata({ FEATURES_FILE }).error('Failed to parse features.yaml');
		}
	}
}
