import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks'
import { InvalidPermissionsError } from '@lib/errors';
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

type CommandContext = {
	/**
	 * The interaction of the current command call.
	 *
	 * @remark Currently only supports slash commands.
	 */
	interaction: ChatInputCommandInteraction;
};

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

type SubcommandMap<T extends string = string> = Record<T, {
	handler: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
	preconditions?: BasePrecondition[];
}>;

export abstract class BaseCommand {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: BasePrecondition[];

	private localStorage: AsyncLocalStorage<CommandContext>;
	private subcommandMap?: SubcommandMap;

	public constructor(options: CommandOptions) {
		this.name          = options.data.name;
		this.data          = options.data;
		this.preconditions = options.preconditions ?? [];
		this.localStorage = new AsyncLocalStorage();
	}

	/**
	 * When called via {@link callHandler} contains information specific to that command call.
	 *
	 * @remarks Values will be `undefined` if the command was not called with `callHandler`.
	 */
	public get ctx() {
		return this.localStorage.getStore();
	}

	/**
	 * Creates the command context and calls the command's `handle` method.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 */
	public async callHandler(interaction: ChatInputCommandInteraction): Promise<unknown> {
		return this.localStorage.run({ interaction }, async () => await this.handle(interaction));
	}

	/**
	 * The actual logic that is executed when the user executes this command.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 */
	public abstract handle(interaction: ChatInputCommandInteraction): Promise<unknown>;

	/**
	 * When overridden, handles autocomplete interactions for this command.
	 *
	 * @param interaction The {@link AutocompleteInteraction}.
	 */
	public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
		return Promise.resolve();
	}

	/**
	 * If this command has a subcommand map, calls the appropriate subcommand method based on the
	 * interaction.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 *
	 * @see {@link createSubcommandMap}
	 */
	public async handleSubcommand(interaction: ChatInputCommandInteraction) {
		if (!this.subcommandMap) {
			throw new Error(`No subcommand map for command "${this.name}".`);
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const { handler, preconditions } = this.subcommandMap[subcommandName];

		if (preconditions) {
			for (const precondition of preconditions) {
				await precondition.checkAndThrow(interaction);
			}
		}

		await handler.bind(this)(interaction);
	}

	/**
	 * Asserts that the {@link ChatInputCommandInteraction|interaction} has
	 * {@link PermissionResolvable|permissions} and throws an {@link InvalidPermissionsError}
	 * otherwise.
	 *
	 * @param interaction The interaction to assert permissions of.
	 * @param permissions Permissions to assert that the interaction has.
	 * @param message Optional error message if the assertion fails.
	 */
	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not shave permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
	}

	/**
	 * Sets a {@link map} on the instance that defines class methods keyed by its "name" for use
	 * with {@link handleSubcommand}.
	 *
	 * @param map The {@link Map} of class instance methods keyed by the name of the subcommand as
	 * defined in {@link CommandOptions.data}.
	 */
	public createSubcommandMap<T extends string>(map: SubcommandMap<T>) {
		if (this.subcommandMap) {
			throw new Error('A subcommand map has already been defined for this command.');
		}

		this.subcommandMap = map;
	}

	/**
	 * Shortcut method for `tryToRespond(interaction, options)`.
	 * @param options Message string or {@link InteractionReplyOptions|reply options}.
	 */
	public async tryToRespond(options: string | InteractionReplyOptions) {
		return tryToRespond(this.ctx?.interaction!, options);
	}
}
