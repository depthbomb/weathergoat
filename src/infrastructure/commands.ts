import { logger } from '@lib/logger';
import { InvalidPermissionsError } from '@errors';
import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ApplicationCommandOptionType } from 'discord.js';
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type { LogLayer } from 'loglayer';
import type { BasePrecondition } from '@infra/preconditions';
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

type SubcommandHandler = (interaction: ChatInputCommandInteraction) => Promise<unknown>;

type SubcommandDefinition = {
	handlerKey: string | symbol;
	preconditions?: BasePrecondition[];
};

const SUBCOMMAND_METADATA = Symbol('command.subcommands');

function getOwnSubcommandDefinitions(target: object) {
	const existing = (target as Record<PropertyKey, unknown>)[SUBCOMMAND_METADATA];
	if (existing instanceof Map) {
		return existing as Map<string, SubcommandDefinition>;
	}

	const created = new Map<string, SubcommandDefinition>();
	Object.defineProperty(target, SUBCOMMAND_METADATA, {
		value: created,
		enumerable: false,
		configurable: false,
		writable: false
	});

	return created;
}

export function subcommand(name: string, ...preconditions: BasePrecondition[]) {
	return function(
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
	) {
		if (typeof propertyKey !== 'string') {
			throw new TypeError('Subcommand handlers must use string method names.');
		}

		if (typeof descriptor.value !== 'function') {
			throw new TypeError(`Subcommand decorator can only be applied to methods. Received "${propertyKey}".`);
		}

		const definitions = getOwnSubcommandDefinitions(target);
		if (definitions.has(name)) {
			throw new Error(`Duplicate @subcommand declaration for "${name}".`);
		}

		definitions.set(name, {
			handlerKey: propertyKey,
			preconditions
		});
	};
}

export abstract class BaseCommand {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: BasePrecondition[];
	public readonly logger: LogLayer;

	private localStorage: AsyncLocalStorage<CommandContext>;
	private subcommandsValidated = false;

	public constructor(options: CommandOptions) {
		this.name          = options.data.name;
		this.data          = options.data;
		this.preconditions = options.preconditions ?? [];
		this.localStorage  = new AsyncLocalStorage();
		this.logger        = logger.child().withPrefix(`[Command(${this.name})]`);
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
		return this.localStorage.run({ interaction }, async () => {
			this.ensureSubcommandsValid();
			return this.handle(interaction);
		});
	}

	/**
	 * The actual logic that is executed when the user executes this command.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 */
	public async handle(interaction: ChatInputCommandInteraction): Promise<unknown> {
		const declaredSubcommands = this.getDeclaredSubcommandNames();
		if (declaredSubcommands.length === 0) {
			throw new Error(`Command "${this.name}" must implement "handle" because no subcommands are declared in command data.`);
		}

		return this.handleSubcommand(interaction);
	}

	/**
	 * When overridden, handles autocomplete interactions for this command.
	 *
	 * @param interaction The {@link AutocompleteInteraction}.
	 */
	public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
		return Promise.resolve();
	}

	/**
	 * Calls the appropriate subcommand method based on the interaction.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 */
	public async handleSubcommand(interaction: ChatInputCommandInteraction) {
		this.ensureSubcommandsValid();

		const subcommandName = interaction.options.getSubcommand(true);
		const handler        = this.getSubcommandHandler(subcommandName);
		const preconditions  = this.getSubcommandDefinition(subcommandName)?.preconditions;

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
	 * Shortcut method for `tryToRespond(interaction, options)`.
	 * @param options Message string or {@link InteractionReplyOptions|reply options}.
	 */
	public async tryToRespond(options: string | InteractionReplyOptions) {
		return tryToRespond(this.ctx?.interaction!, options);
	}

	public async getCommandLink(commandName: string, ...path: string[]) {
		const interaction = this.ctx?.interaction;
		if (!interaction) {
			return `/${[commandName, ...path].join(' ')}`;
		}

		return interaction.client.getCommandLink(commandName, ...path);
	}

	private ensureSubcommandsValid() {
		if (this.subcommandsValidated) {
			return;
		}

		const declaredSubcommands = this.getDeclaredSubcommandNames();
		if (declaredSubcommands.length === 0) {
			this.subcommandsValidated = true;
			return;
		}

		const declaredSet        = new Set(declaredSubcommands);
		const decoratedNames     = [...this.getSubcommandDefinitions().keys()];
		const unknownDecorators  = decoratedNames.filter(name => !declaredSet.has(name));
		const missingDecorators  = declaredSubcommands.filter(name => !this.getSubcommandDefinition(name));
		if (missingDecorators.length > 0 || unknownDecorators.length > 0) {
			const errors = [`Invalid subcommand handlers for command "${this.name}".`];
			if (missingDecorators.length > 0) {
				errors.push(`Missing @subcommand decorator(s) for: ${missingDecorators.join(', ')}`);
			}

			if (unknownDecorators.length > 0) {
				errors.push(`Decorated subcommand(s) not declared in builder: ${unknownDecorators.join(', ')}`);
			}

			throw new Error(errors.join('\n'));
		}

		this.subcommandsValidated = true;
	}

	private getSubcommandHandler(subcommandName: string) {
		const definition = this.getSubcommandDefinition(subcommandName);
		if (!definition) {
			const available = [...this.getSubcommandDefinitions().keys()].join(', ') || '(none)';
			throw new Error([
				`Subcommand "${subcommandName}" is not decorated for command "${this.name}".`,
				`Available decorated subcommand(s): ${available}`
			].join('\n'));
		}

		const handler = this.getSubcommandHandlerMaybe(definition);
		if (handler) {
			return handler;
		}

		const available = [...this.getSubcommandDefinitions().keys()]
			.filter(name => {
				const definition = this.getSubcommandDefinition(name);
				return definition && this.getSubcommandHandlerMaybe(definition);
			})
			.join(', ') || '(none)';

		throw new Error([
			`Subcommand "${subcommandName}" is decorated but no handler method exists for command "${this.name}".`,
			`Available handler method(s): ${available}`
		].join('\n'));
	}

	private getSubcommandDefinition(subcommandName: string) {
		return this.getSubcommandDefinitions().get(subcommandName);
	}

	private getSubcommandDefinitions() {
		const definitions = new Map<string, SubcommandDefinition>();

		let prototype = Object.getPrototypeOf(this);
		while (prototype && prototype !== BaseCommand.prototype) {
			const ownDefinitions = (prototype as Record<PropertyKey, unknown>)[SUBCOMMAND_METADATA];
			if (ownDefinitions instanceof Map) {
				for (const [name, definition] of ownDefinitions.entries()) {
					if (!definitions.has(name)) {
						definitions.set(name, definition as SubcommandDefinition);
					}
				}
			}

			prototype = Object.getPrototypeOf(prototype);
		}

		return definitions;
	}

	private getSubcommandHandlerMaybe(definition: SubcommandDefinition) {
		const handler = (this as Record<PropertyKey, unknown>)[definition.handlerKey];
		if (typeof handler !== 'function') {
			return;
		}

		return handler as SubcommandHandler;
	}

	private getDeclaredSubcommandNames() {
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
}
