import type { Precondition } from '@preconditions';
import type {
	Awaitable,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export interface ICommand {
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	preconditions?: Precondition[];
	handle(interaction: ChatInputCommandInteraction): Awaitable<unknown>;
	handleAutocomplete?(interaction: AutocompleteInteraction): Awaitable<unknown>;
}
