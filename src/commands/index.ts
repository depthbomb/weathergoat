import type {
	Awaitable,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export interface ICommand {
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	handle(interaction: ChatInputCommandInteraction): Awaitable<unknown>;
	handleAutocomplete?(interaction: AutocompleteInteraction): Awaitable<unknown>;
}
