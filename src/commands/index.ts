import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks'
import { InvalidPermissionsError } from '@lib/errors';
import { ApplicationCommandOptionType } from 'discord.js';
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
		const entry          = this.subcommandMap[subcommandName];
		if (!entry) {
			const mappedSubcommands = Object.keys(this.subcommandMap);
			const available         = mappedSubcommands.length === 0 ? '(none)' : mappedSubcommands.join(', ');

			throw new Error([
				`Subcommand "${subcommandName}" is not mapped for command "${this.name}".`,
				`Mapped subcommands: ${available}`
			].join('\n'));
		}

		const { handler, preconditions } = entry;

		if (preconditions) {
			for (const precondition of preconditions) {
				await precondition.checkAndThrow(interaction);
			}
		}

		await handler.call(this, interaction);
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

		message ??= 'You do not have permission to use this command.';

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

		const declaredSubcommands = this.getDeclaredSubcommandNames();
		if (declaredSubcommands.length === 0) {
			throw new Error(`Cannot create subcommand map for command "${this.name}" because no subcommands are declared in command data.`);
		}

		const declaredSet       = new Set(declaredSubcommands);
		const mappedSubcommands = Object.keys(map);
		const mappedSet         = new Set(mappedSubcommands);
		const unknownHandlers   = mappedSubcommands.filter(name => !declaredSet.has(name));
		const missingHandlers   = declaredSubcommands.filter(name => !mappedSet.has(name));
		if (missingHandlers.length > 0 || unknownHandlers.length > 0) {
			const errors = [`Invalid subcommand map for command "${this.name}".`];
			if (missingHandlers.length > 0) {
				errors.push(`Missing handler(s) for: ${missingHandlers.join(', ')}`);
			}

			if (unknownHandlers.length > 0) {
				errors.push(`Mapped subcommand(s) not declared in builder: ${unknownHandlers.join(', ')}`);
			}

			throw new Error(errors.join('\n'));
		}

		this.subcommandMap = map;
	}

	private getDeclaredSubcommandNames(): string[] {
		const names   = [] as string[];
		const options = this.data.toJSON().options ?? [];
		for (const option of options) {
			if (option.type === ApplicationCommandOptionType.Subcommand) {
				names.push(option.name);
			} else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
				for (const nested of option.options ?? []) {
					if (nested.type === ApplicationCommandOptionType.Subcommand) {
						names.push(nested.name);
					}
				}
			}
		}

		return names;
	}

	/**
	 * Shortcut method for `tryToRespond(interaction, options)`.
	 * @param options Message string or {@link InteractionReplyOptions|reply options}.
	 */
	public async tryToRespond(options: string | InteractionReplyOptions) {
		return tryToRespond(this.ctx?.interaction!, options);
	}
}
