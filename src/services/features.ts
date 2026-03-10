import { Collection } from 'discord.js';
import { injectable } from '@needle-di/core';
import { FEATURE_DEFINITIONS } from '@constants';

export type FeatureName = keyof typeof FEATURE_DEFINITIONS;

export type FeatureConfig = {
	fraction: number;
	description?: string;
};

class Feature {
	public constructor(
		public readonly name: FeatureName,
		public readonly fraction: number,
		public readonly description?: string
	) { }

	public check() {
		return Math.random() < this.fraction;
	}
}

@injectable()
export class FeaturesService {
	private readonly features: Collection<FeatureName, Feature>;

	public constructor() {
		this.features = new Collection();

		for (const [name, config] of Object.entries(FEATURE_DEFINITIONS)) {
			const feature = new Feature((name as FeatureName), config.fraction, config.description);
			this.features.set((name as FeatureName), feature);
		}
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
			fraction: f.fraction
		}));
	}
}
