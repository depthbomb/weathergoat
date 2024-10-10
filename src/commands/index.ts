import { InvalidPermissionsError } from '@errors';
import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks'
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type { BasePrecondition } from '@preconditions';
import type {
	PermissionResolvable,
	AutocompleteInteraction,
	InteractionReplyOptions,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

type SubcommandMap<T extends string = string> = Record<T, {
	handler: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
	preconditions?: BasePrecondition[];
}>;

type CommandOptions = {
	/**
	 * Command data, usually defined via {@link SlashCommandBuilder}.
	 */
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	/**
	 * Instances of {@link BasePrecondition|preconditions} whose {@link BasePrecondition.check|check}
	 * method is called before the command's {@link BaseCommand.handle|handler} method.
	 */
	preconditions?: BasePrecondition[];
};

export abstract class BaseCommand {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: BasePrecondition[];

	private _localStorage: AsyncLocalStorage<ChatInputCommandInteraction>;
	private _subcommandMap?: SubcommandMap;

	public constructor(options: CommandOptions) {
		this.name = options.data.name;
		this.data = options.data;
		this.preconditions = options.preconditions ?? [];

		this._localStorage = new AsyncLocalStorage();
	}

	public get ctx() {
		return {
			interaction: this._localStorage.getStore()
		};
	}

	public async callCommand(interaction: ChatInputCommandInteraction): Promise<unknown> {
		return this._localStorage.run(interaction, async () => await this.handle(interaction));
	}

	/**
	 * The actual logic that is executed when the user executes this command.
	 * @param interaction The {@link ChatInputCommandInteracation}
	 */
	public abstract handle(interaction: ChatInputCommandInteraction): Promise<unknown>;

	/**
	 * When overridden, handles autocomplete interactions for this command.
	 * @param interaction The {@link AutocompleteInteraction}.
	 */
	public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
		return Promise.resolve();
	}

	public async handleSubcommand(interaction: ChatInputCommandInteraction) {
		if (!this._subcommandMap) {
			throw new Error(`No subcommand map for command "${this.name}".`);
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const { handler, preconditions } = this._subcommandMap[subcommandName];

		if (preconditions) {
			for (const precondition of preconditions) {
				await precondition.checkAndThrow(interaction);
			}
		}

		await handler.bind(this)(interaction);
	}

	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not shave permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
	}

	public createSubcommandMap<T extends string>(map: SubcommandMap<T>) {
		if (this._subcommandMap) {
			throw new Error('A subcommand map has already been defined for this command.');
		}

		this._subcommandMap = map;
	}

	public async tryToRespond(options: string | InteractionReplyOptions) {
		return tryToRespond(this.ctx.interaction!, options);
	}
}
