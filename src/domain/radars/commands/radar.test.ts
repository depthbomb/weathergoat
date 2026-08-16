import { RadarCommand } from './radar';
import { test, expect, describe } from 'bun:test';
import type { AutocompleteInteraction } from 'discord.js';

describe('radar autocomplete', () => {
	test('responds with initial choices when the focused value is empty', async () => {
		let response: Array<{ name: string; value: string }> = [];
		const interaction = {
			options: {
				getFocused: () => '   '
			},
			respond: async (choices: Array<{ name: string; value: string }>) => {
				response = choices;
			}
		} as unknown as AutocompleteInteraction;

		await new RadarCommand().handleAutocomplete(interaction);

		expect(response).toHaveLength(25);
		expect(response[0]).toEqual({ name: 'Aberdeen, South Dakota', value: 'KABR' });
	});
});
