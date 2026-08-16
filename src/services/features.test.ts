import { FEATURE_FLAGS } from '@constants';
import { parseFeatureConfig } from './features';
import { test, expect, describe } from 'bun:test';

function createValidConfig() {
	return Object.fromEntries(FEATURE_FLAGS.map(name => [name, {
		description: `${name} description`,
		enabled: false,
		rolloutPercentage: 100
	}]));
}

describe('feature configuration parsing', () => {
	test('validates and returns every declared feature', () => {
		const config = parseFeatureConfig(JSON.stringify(createValidConfig()));

		expect([...config.keys()]).toEqual([...FEATURE_FLAGS]);
		expect(config.get('disableAlertReporting')).toEqual({
			description: 'disableAlertReporting description',
			enabled: false,
			rolloutPercentage: 100
		});
	});

	test('rejects incomplete configuration', () => {
		const config = createValidConfig();
		delete config.disableAlertReporting;

		expect(() => parseFeatureConfig(JSON.stringify(config))).toThrow('disableAlertReporting');
	});

	test('rejects invalid feature values', () => {
		const config = createValidConfig();
		config.disableAlertReporting.rolloutPercentage = 101;

		expect(() => parseFeatureConfig(JSON.stringify(config))).toThrow(RangeError);
	});
});
