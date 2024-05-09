import { Command } from '@commands';
import { SlashCommandBuilder } from 'discord.js';
import { getEntry, getEntries } from '@lib/glossary';
import type { CacheType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

export default class RadarCommand extends Command {
	public constructor() {
		super(new SlashCommandBuilder()
			.setName('glossary')
			.setDescription('Looks up the definition of a term in the NWS glossary')
			.addStringOption(
				o => o.setName('term')
					  .setDescription('Term query')
					  .setAutocomplete(true)
					  .setRequired(true)
			));
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const term  = interaction.options.getString('term', true);
		const entry = await getEntry(term);
		if (!entry) {
			throw new Error('Somehow didn\'t get a valid glossary term after autocomplete handler?');
		}

		return interaction.reply(`# ${term}\n${entry.cleanedDefinition}`);
	}

	public async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>) {
		const value = interaction.options.getFocused().trim().toLowerCase();

		if (value.length === 0) return;

		const entries  = await getEntries();
		const filtered = entries.filter((v)=>
			v.originalTerm?.toLowerCase().includes(value) ||
			v.originalTerm?.toLowerCase() === value ||
			v.originalDefinition?.toLowerCase().includes(value)
		);
		const limited  = [...filtered.entries()].slice(0, 25); // Limit the results to 25

		await interaction.respond(limited.map(([_, v]) => ({ name: v.originalTerm!, value: v.originalTerm! })));
	}
}
