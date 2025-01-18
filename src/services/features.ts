import { logger } from '@logger';
import { Collection } from 'discord.js';
import { plainToInstance } from 'class-transformer';
import type { Maybe } from '#types';
import type { Logger } from 'winston';
import type { IService } from '@services';

export interface IFeaturesService extends IService {
	set(name: string, fraction: number, description?: string): IFeaturesService;
	get(name: string): Maybe<Feature>;
	isFeatureEnabled(name: string, defaultValue?: boolean): boolean;
	all(): Feature[];
}

class Feature {
	public name!: string;
	public fraction!: number;
	public description?: string;
	public check() {
		return Math.random() < this.fraction;
	}
}

export default class FeaturesService implements IFeaturesService {
	private readonly _logger: Logger;
	private readonly _features: Collection<string, Feature>;

	public constructor() {
		this._logger = logger.child({ service: 'Features' });
		this._features = new Collection();
	}

	public set(name: string, fraction: number, description?: string) {
		const obj = { name, fraction, description };

		this._features.set(name, plainToInstance(Feature, obj));

		this._logger.info('Created feature flag', { name, fraction, description });

		return this;
	}

	public get(name: string) {
		return this._features.get(name);
	}

	public isFeatureEnabled(name: string, defaultValue?: boolean) {
		const feature = this._features.find(f => f.name === name);
		if (!feature) {
			if (typeof defaultValue === 'undefined') {
				throw new Error(`Feature flag not found: ${name}`);
			}

			return defaultValue;
		}

		return feature.check();
	}

	public all() {
		return Array.from(this._features.values());
	}
}
