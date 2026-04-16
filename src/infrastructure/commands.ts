import { logger } from '@lib/logger';
import { InvalidPermissionsError } from '@errors';
import { tryToRespond } from '@utils/interactions';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ApplicationCommandOptionType } from 'discord.js';
import { toComponentMatch, createComponentMatcher } from '@infra/components';
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type { LogLayer } from 'loglayer';
import type { BasePrecondition } from '@infra/preconditions';
import type { ComponentMatch, ComponentMatcher } from '@infra/components';
import type {
	PermissionResolvable,
	AutocompleteInteraction,
	InteractionReplyOptions,
	ChatInputCommandInteraction,
	MessageComponentInteraction,
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

type SubcommandMap<T extends string = string> = Record<T, BasePrecondition[]>;

type ComponentRouteHandler = (interaction: MessageComponentInteraction, match: ComponentMatch) => Promise<unknown>;

type ComponentRouteDefinition = {
	pattern: string;
	handler: ComponentRouteHandler;
};

type RegisteredComponentRoute = {
	pattern: string;
	handler: ComponentRouteHandler;
	matcher: ComponentMatcher;
};

export type CommandComponentRoute = {
	pattern: string;
	handler: ComponentRouteHandler;
	match: ComponentMatch;
};

export abstract class BaseCommand {
	public readonly name: string;
	public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	public readonly preconditions: BasePrecondition[];
	public readonly logger: LogLayer;

	private localStorage: AsyncLocalStorage<CommandContext>;
	private subcommandMap?: SubcommandMap;
	private componentRoutes: RegisteredComponentRoute[] = [];

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
		const context = this.localStorage.getStore();
		if (!context) {
			throw new Error(`No interaction context available for command "${this.name}".`);
		}

		return context;
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
	 * Calls the configured subcommand handler for the interaction and runs any preconditions
	 * registered for that subcommand.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction}.
	 *
	 * @see {@link configureSubcommands}
	 */
	public async handleSubcommand(interaction: ChatInputCommandInteraction) {
		if (!this.subcommandMap) {
			throw new Error(`Subcommands have not been configured for command "${this.name}".`);
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const handler        = this.getSubcommandHandler(subcommandName);
		const preconditions  = this.subcommandMap[subcommandName];

		for (const precondition of preconditions) {
			await precondition.checkAndThrow(interaction);
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
	 * Configures the subcommands declared by this command for use with {@link handleSubcommand}.
	 * Handler methods are resolved automatically from instance methods whose names match the
	 * declared subcommand names.
	 *
	 * @param map A record keyed by declared subcommand name where each value is the ordered list of
	 * preconditions to run before that subcommand handler.
	 */
	public configureSubcommands<T extends string>(map: SubcommandMap<T>) {
		if (this.subcommandMap) {
			throw new Error('Subcommands have already been configured for this command.');
		}

		const declaredSubcommands = this.getDeclaredSubcommandNames();
		if (declaredSubcommands.length === 0) {
			throw new Error(`Cannot configure subcommands for command "${this.name}" because no subcommands are declared in command data.`);
		}

		const declaredSet         = new Set(declaredSubcommands);
		const configuredNames     = Object.keys(map);
		const configuredSet       = new Set(configuredNames);
		const unknownConfigs      = configuredNames.filter(name => !declaredSet.has(name));
		const missingConfigs      = declaredSubcommands.filter(name => !configuredSet.has(name));
		const missingHandlerNames = declaredSubcommands.filter(name => !this.hasSubcommandHandler(name));
		if (missingHandlerNames.length > 0 || missingConfigs.length > 0 || unknownConfigs.length > 0) {
			const errors = [`Invalid subcommand configuration for command "${this.name}".`];
			if (missingHandlerNames.length > 0) {
				errors.push(`Missing handler method(s) for: ${missingHandlerNames.join(', ')}`);
			}

			if (missingConfigs.length > 0) {
				errors.push(`Missing subcommand config(s) for: ${missingConfigs.join(', ')}`);
			}

			if (unknownConfigs.length > 0) {
				errors.push(`Configured subcommand(s) not declared in builder: ${unknownConfigs.join(', ')}`);
			}

			throw new Error(errors.join('\n'));
		}

		this.subcommandMap = map;
	}

	public createComponentRoutes(routes: ComponentRouteDefinition[]) {
		this.componentRoutes = routes.map(route => ({
			...route,
			matcher: createComponentMatcher(route.pattern)
		}));
	}

	public getComponentRoute(customId: string) {
		for (const route of this.componentRoutes) {
			const match = toComponentMatch(route.matcher, customId);
			if (!match) {
				continue;
			}

			return {
				pattern: route.pattern,
				handler: route.handler,
				match
			} satisfies CommandComponentRoute;
		}
	}

	public async callComponentHandler(interaction: MessageComponentInteraction, route: CommandComponentRoute) {
		await route.handler.call(this, interaction, route.match);
	}

	/**
	 * Shortcut method for `tryToRespond(interaction, options)`.
	 * @param options Message string or {@link InteractionReplyOptions|reply options}.
	 */
	public async tryToRespond(options: string | InteractionReplyOptions) {
		return tryToRespond(this.ctx.interaction, options);
	}

	public async getCommandLink(commandName: string, ...path: string[]) {
		const interaction = this.localStorage.getStore()?.interaction;
		if (!interaction) {
			return `/${[commandName, ...path].join(' ')}`;
		}

		return interaction.client.getCommandLink(commandName, ...path);
	}

	private hasSubcommandHandler(subcommandName: string) {
		return typeof (this as Record<string, unknown>)[subcommandName] === 'function';
	}

	private getSubcommandHandler(subcommandName: string) {
		const handler = (this as Record<string, unknown>)[subcommandName];
		if (typeof handler !== 'function') {
			throw new Error(`Subcommand "${subcommandName}" does not resolve to a handler method for command "${this.name}".`);
		}

		return handler as (interaction: ChatInputCommandInteraction) => Promise<unknown>;
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
