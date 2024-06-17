import type { BasePrecondition } from '@preconditions';
import type {
	Awaitable,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

type CommandOptions = {
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	preconditions?: BasePrecondition[];
};

export abstract class BaseCommand {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: Set<BasePrecondition>;

	public constructor(options: CommandOptions) {
		this.name          = options.data.name;
		this.data          = options.data;
		this.preconditions = new Set(options.preconditions ?? []);
	}

	public abstract handle(interaction: ChatInputCommandInteraction): Promise<unknown>;
}

export abstract class BaseCommandWithAutocomplete extends BaseCommand {
	public abstract handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown>;
}
