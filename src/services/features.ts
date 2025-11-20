import { logger } from '@lib/logger';
import { Collection } from 'discord.js';
import { injectable } from '@needle-di/core';
import { plainToInstance } from 'class-transformer';
import type { LogLayer } from 'loglayer';

class Feature {
	public name!: string;
	public fraction!: number;
	public description?: string;
	public check() {
		return Math.random() < this.fraction;
	}
}

@injectable()
export class FeaturesService {
	private readonly logger: LogLayer;
	private readonly features: Collection<string, Feature>;

	public constructor() {
		this.logger   = logger.child().withPrefix(FeaturesService.name.bracketWrap());
		this.features = new Collection();
	}

	public set(name: string, fraction: number, description?: string) {
		const obj = { name, fraction, description };

		this.features.set(name, plainToInstance(Feature, obj));

		this.logger.withMetadata({ name, fraction, description }).info('Created feature flag');

		return this;
	}

	public get(name: string) {
		return this.features.get(name);
	}

	public isFeatureEnabled(name: string, defaultValue?: boolean) {
		const feature = this.features.find(f => f.name === name);
		if (!feature) {
			if (typeof defaultValue === 'undefined') {
				throw new Error(`Feature flag not found: ${name}`);
			}

			return defaultValue;
		}

		return feature.check();
	}

	public all() {
		return Array.from(this.features.values());
	}
}
