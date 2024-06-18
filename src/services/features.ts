import { Collection } from 'discord.js';
import { plainToInstance } from 'class-transformer';
import type { IService } from '@services';
import type { Maybe, BaseId } from '#types';

type FeatureId = `${BaseId<'features'>}.${string}`;

export interface IFeaturesService extends IService {
	set(name: FeatureId, fraction: number, description?: string): IFeaturesService;
	get(name: FeatureId): Maybe<Feature>;
	isFeatureEnabled(name: FeatureId, defaultValue?: boolean): boolean;
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
	private readonly _features: Collection<FeatureId, Feature>;

	public constructor() {
		this._features = new Collection();
	}

	public set(name: FeatureId, fraction: number, description?: string) {
		const obj = { name, fraction, description };

		this._features.set(name, plainToInstance(Feature, obj));

		return this;
	}

	public get(name: FeatureId) {
		return this._features.get(name);
	}

	public isFeatureEnabled(name: FeatureId, defaultValue?: boolean) {
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
