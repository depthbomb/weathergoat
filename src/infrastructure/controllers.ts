import { logger } from '@lib/logger';
import { InvalidPermissionsError } from '@errors';
import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ApplicationCommandOptionType } from 'discord.js';
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import { compareComponentMatch, createComponentMatcher, toComponentMatch } from '@infra/components';
import type { LogLayer } from 'loglayer';
import type { Arrayable, Maybe } from '@depthbomb/common/typing';
import type { BasePrecondition } from '@infra/preconditions';
import type { ComponentMatch, ComponentMatcher } from '@infra/components';
import type {
	PermissionResolvable,
	AutocompleteInteraction,
	InteractionReplyOptions,
	MessageComponentInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

type CommandContext = {
	interaction: ChatInputCommandInteraction;
};

type CommandComponentContext = {
	interaction: MessageComponentInteraction;
	match: ComponentMatch;
};

type CommandOptions = {
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	preconditions?: BasePrecondition[];
};

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<unknown>;
type SubcommandHandler = (interaction: ChatInputCommandInteraction) => Promise<unknown>;
type ComponentHandler = (interaction: MessageComponentInteraction, match: ComponentMatch) => Promise<unknown>;

type CommandDefinition = {
	handlerKey: string | symbol;
	preconditions: BasePrecondition[];
};

type SubcommandDefinition = {
	handlerKey: string | symbol;
	preconditions: BasePrecondition[];
};

type ComponentDefinition = {
	handlerKey: string | symbol;
	customIds: string[];
	matchers: ComponentMatcher[];
};

export type ControllerComponentRoute = {
	name: string;
	match: ComponentMatch;
};

const COMMAND_METADATA = Symbol('command.handler');
const SUBCOMMAND_METADATA = Symbol('command.subcommands');
const COMPONENT_METADATA = Symbol('command.components');

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

function getOwnComponentDefinitions(target: object) {
	const existing = (target as Record<PropertyKey, unknown>)[COMPONENT_METADATA];
	if (existing instanceof Map) {
		return existing as Map<string | symbol, ComponentDefinition>;
	}

	const created = new Map<string | symbol, ComponentDefinition>();
	Object.defineProperty(target, COMPONENT_METADATA, {
		value: created,
		enumerable: false,
		configurable: false,
		writable: false
	});

	return created;
}

export function command(...preconditions: BasePrecondition[]) {
	return function(
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
	) {
		if (typeof descriptor.value !== 'function') {
			throw new TypeError(`Command decorator can only be applied to methods. Received "${String(propertyKey)}".`);
		}

		const existing = (target as Record<PropertyKey, unknown>)[COMMAND_METADATA];
		if (existing) {
			throw new Error('Only one @command decorator may be declared per command class.');
		}

		Object.defineProperty(target, COMMAND_METADATA, {
			value: {
				handlerKey: propertyKey,
				preconditions
			} satisfies CommandDefinition,
			enumerable: false,
			configurable: false,
			writable: false
		});
	};
}

export function subcommand(name: string, ...preconditions: BasePrecondition[]) {
	return function(
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
	) {
		if (typeof descriptor.value !== 'function') {
			throw new TypeError(`Subcommand decorator can only be applied to methods. Received "${String(propertyKey)}".`);
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

export function component(customId: Arrayable<string>) {
	return function(
		target: object,
		propertyKey: string | symbol,
		descriptor: TypedPropertyDescriptor<(...args: any[]) => any>
	) {
		if (typeof descriptor.value !== 'function') {
			throw new TypeError(`Component decorator can only be applied to methods. Received "${String(propertyKey)}".`);
		}

		const customIds = Array.isArray(customId) ? customId : [customId];
		getOwnComponentDefinitions(target).set(propertyKey, {
			handlerKey: propertyKey,
			customIds,
			matchers: customIds.map(createComponentMatcher)
		});
	};
}

export abstract class BaseInteractionController {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: BasePrecondition[];
	public readonly logger: LogLayer;

	private readonly localStorage: AsyncLocalStorage<CommandContext>;
	private readonly componentLocalStorage: AsyncLocalStorage<CommandComponentContext>;
	private handlersValidated = false;

	public constructor(options: CommandOptions) {
		this.name                  = options.data.name;
		this.data                  = options.data;
		this.preconditions         = options.preconditions ?? [];
		this.localStorage          = new AsyncLocalStorage();
		this.componentLocalStorage = new AsyncLocalStorage();
		this.logger                = logger.child().withPrefix(`[Command(${this.name})]`);
	}

	public get ctx() {
		return this.localStorage.getStore();
	}

	public get componentCtx() {
		return this.componentLocalStorage.getStore();
	}

	public async callHandler(interaction: ChatInputCommandInteraction): Promise<unknown> {
		return this.localStorage.run({ interaction }, async () => {
			this.ensureHandlersValid();
			return this.handle(interaction);
		});
	}

	public async callComponentHandler(interaction: MessageComponentInteraction, route: ControllerComponentRoute): Promise<unknown> {
		return this.componentLocalStorage.run({ interaction, match: route.match }, async () => {
			this.ensureHandlersValid();
			const definition = this.getComponentDefinition(route.name);
			const handler    = this.getComponentHandler(definition);

			return handler.call(this, interaction, route.match);
		});
	}

	public async handle(interaction: ChatInputCommandInteraction): Promise<unknown> {
		const declaredSubcommands = this.getDeclaredSubcommandNames();
		if (declaredSubcommands.length > 0) {
			return this.handleSubcommand(interaction);
		}

		return this.handleCommand(interaction);
	}

	public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
		return Promise.resolve();
	}

	public async handleCommand(interaction: ChatInputCommandInteraction) {
		this.ensureHandlersValid();

		const definition    = this.getCommandDefinition();
		const handler       = this.getCommandHandler(definition);
		const preconditions = definition.preconditions;

		for (const precondition of preconditions) {
			await precondition.checkAndThrow(interaction);
		}

		await handler.call(this, interaction);
	}

	public async handleSubcommand(interaction: ChatInputCommandInteraction) {
		this.ensureHandlersValid();

		const subcommandName = interaction.options.getSubcommand(true);
		const definition     = this.getSubcommandDefinition(subcommandName);
		const handler        = this.getSubcommandHandler(definition);

		for (const precondition of definition.preconditions) {
			await precondition.checkAndThrow(interaction);
		}

		await handler.call(this, interaction);
	}

	public getComponentRoute(customId: string): Maybe<ControllerComponentRoute> {
		let best: Maybe<ControllerComponentRoute>;

		for (const [name, definition] of this.getComponentDefinitions()) {
			for (const matcher of definition.matchers) {
				const match = toComponentMatch(matcher, customId);
				if (!match) {
					continue;
				}

				if (!best || compareComponentMatch(match, best.match) > 0) {
					best = { name: String(name), match };
				}
			}
		}

		return best;
	}

	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not have permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
	}

	private ensureHandlersValid() {
		if (this.handlersValidated) {
			return;
		}

		const declaredSubcommands = this.getDeclaredSubcommandNames();
		const commandDefinition   = this.getCommandDefinitionMaybe();

		if (declaredSubcommands.length === 0) {
			if (!commandDefinition) {
				throw new Error(`Command "${this.name}" must declare exactly one @command handler because no subcommands are defined.`);
			}

			if (this.getSubcommandDefinitions().size > 0) {
				throw new Error(`Command "${this.name}" cannot declare @subcommand handlers because no subcommands are defined in the builder.`);
			}

			if (!this.getCommandHandlerMaybe(commandDefinition)) {
				throw new Error(`Command "${this.name}" has an invalid @command handler.`);
			}
		} else {
			if (commandDefinition) {
				throw new Error(`Command "${this.name}" cannot declare @command and @subcommand handlers at the same time.`);
			}

			const declaredSet       = new Set(declaredSubcommands);
			const decoratedNames    = [...this.getSubcommandDefinitions().keys()];
			const unknownDecorators = decoratedNames.filter(name => !declaredSet.has(name));
			const missingDecorators = declaredSubcommands.filter(name => !this.getSubcommandDefinitionMaybe(name));
			const missingHandlers   = decoratedNames.filter(name => !this.getSubcommandHandlerMaybe(this.getSubcommandDefinitionMaybe(name)));

			if (missingDecorators.length > 0 || unknownDecorators.length > 0 || missingHandlers.length > 0) {
				const errors = [`Invalid subcommand handlers for command "${this.name}".`];
				if (missingDecorators.length > 0) {
					errors.push(`Missing @subcommand decorator(s) for: ${missingDecorators.join(', ')}`);
				}

				if (unknownDecorators.length > 0) {
					errors.push(`Decorated subcommand(s) not declared in builder: ${unknownDecorators.join(', ')}`);
				}

				if (missingHandlers.length > 0) {
					errors.push(`Decorated subcommand(s) with invalid handler method(s): ${missingHandlers.join(', ')}`);
				}

				throw new Error(errors.join('\n'));
			}
		}

		for (const [name, definition] of this.getComponentDefinitions()) {
			if (!this.getComponentHandlerMaybe(definition)) {
				throw new Error(`Command "${this.name}" has an invalid @component handler for "${String(name)}".`);
			}
		}

		this.handlersValidated = true;
	}

	private getCommandDefinition() {
		const definition = this.getCommandDefinitionMaybe();
		if (!definition) {
			throw new Error(`No @command handler is defined for command "${this.name}".`);
		}

		return definition;
	}

	private getCommandDefinitionMaybe() {
		let prototype = Object.getPrototypeOf(this);
		while (prototype && prototype !== BaseInteractionController.prototype) {
			const definition = (prototype as Record<PropertyKey, unknown>)[COMMAND_METADATA];
			if (definition) {
				return definition as CommandDefinition;
			}

			prototype = Object.getPrototypeOf(prototype);
		}
	}

	private getCommandHandler(definition: CommandDefinition) {
		const handler = this.getCommandHandlerMaybe(definition);
		if (handler) {
			return handler;
		}

		throw new Error(`Command "${this.name}" is decorated but no handler method exists.`);
	}

	private getCommandHandlerMaybe(definition: Maybe<CommandDefinition>) {
		if (!definition) {
			return;
		}

		const handler = (this as Record<PropertyKey, unknown>)[definition.handlerKey];
		if (typeof handler !== 'function') {
			return;
		}

		return handler as CommandHandler;
	}

	private getSubcommandDefinition(subcommandName: string) {
		const definition = this.getSubcommandDefinitionMaybe(subcommandName);
		if (definition) {
			return definition;
		}

		const available = [...this.getSubcommandDefinitions().keys()].join(', ') || '(none)';
		throw new Error([
			`Subcommand "${subcommandName}" is not decorated for command "${this.name}".`,
			`Available decorated subcommand(s): ${available}`
		].join('\n'));
	}

	private getSubcommandDefinitionMaybe(subcommandName: string) {
		return this.getSubcommandDefinitions().get(subcommandName);
	}

	private getSubcommandDefinitions() {
		const definitions = new Map<string, SubcommandDefinition>();
		let prototype = Object.getPrototypeOf(this);
		while (prototype && prototype !== BaseInteractionController.prototype) {
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

	private getSubcommandHandler(definition: SubcommandDefinition) {
		const handler = this.getSubcommandHandlerMaybe(definition);
		if (handler) {
			return handler;
		}

		throw new Error(`Subcommand handler is decorated but its method does not exist for command "${this.name}".`);
	}

	private getSubcommandHandlerMaybe(definition: Maybe<SubcommandDefinition>) {
		if (!definition) {
			return;
		}

		const handler = (this as Record<PropertyKey, unknown>)[definition.handlerKey];
		if (typeof handler !== 'function') {
			return;
		}

		return handler as SubcommandHandler;
	}

	private getComponentDefinitions() {
		const definitions = new Map<string | symbol, ComponentDefinition>();
		let prototype = Object.getPrototypeOf(this);
		while (prototype && prototype !== BaseInteractionController.prototype) {
			const ownDefinitions = (prototype as Record<PropertyKey, unknown>)[COMPONENT_METADATA];
			if (ownDefinitions instanceof Map) {
				for (const [name, definition] of ownDefinitions.entries()) {
					if (!definitions.has(name)) {
						definitions.set(name, definition as ComponentDefinition);
					}
				}
			}

			prototype = Object.getPrototypeOf(prototype);
		}

		return definitions;
	}

	private getComponentDefinition(name: string) {
		const definition = [...this.getComponentDefinitions().entries()]
			.find(([key]) => String(key) === name)?.[1];
		if (definition) {
			return definition;
		}

		throw new Error(`No @component handler "${name}" is defined for command "${this.name}".`);
	}

	private getComponentHandler(definition: ComponentDefinition) {
		const handler = this.getComponentHandlerMaybe(definition);
		if (handler) {
			return handler;
		}

		throw new Error(`Component handler is decorated but its method does not exist for command "${this.name}".`);
	}

	private getComponentHandlerMaybe(definition: Maybe<ComponentDefinition>) {
		if (!definition) {
			return;
		}

		const handler = (this as Record<PropertyKey, unknown>)[definition.handlerKey];
		if (typeof handler !== 'function') {
			return;
		}

		return handler as ComponentHandler;
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
}
