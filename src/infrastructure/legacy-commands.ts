import { logger } from '@lib/logger';
import { Collection } from 'discord.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogLayer } from 'loglayer';
import type { Maybe, Nullable } from '@depthbomb/common/typing';
import type { Message, MessagePayload, MessageReplyOptions } from 'discord.js';

type LegacyValueType = 'string' | 'number' | 'int' | 'bool';

export type LegacyCommandContext = {
	message: Message;
	args: LegacyCommandArguments;
	prefix: string;
	invokedName: string;
	subcommandName?: string;
	commands: LegacyCommandRegistry;
	params: LegacyCommandParameters;
	route: LegacyCommandRoute;
};

type LegacyCommandRouteOptions = {
	params?: LegacyCommandParameterDefinition[];
};

type LegacySubcommandDefinition = LegacyCommandParameterDefinition[] | LegacyCommandRouteOptions;

type LegacyCommandOptions = {
	name: string;
	description?: string;
	aliases?: string[];
	params?: LegacyCommandParameterDefinition[];
	subcommands?: Record<string, LegacySubcommandDefinition>;
};

type ParsedLegacyCommand = {
	commandName: string;
	args: LegacyCommandArguments;
};

type LegacyCommandSummary = {
	name: string;
	description?: string;
	syntax: string;
	usage: string;
	usageLines: string[];
	aliases: string[];
	subcommands: string[];
	command: BaseLegacyCommand;
};

export type LegacyCommandParameterDefinition = {
	name: string;
	type: LegacyValueType;
	required: boolean;
	rest: boolean;
};

type LegacyRouteToken = {
	kind: 'literal';
	value: string;
} | {
	kind: 'param';
	name: string;
	valueType: LegacyValueType;
	required: boolean;
	rest: boolean;
};

type LegacyCommandRoute = {
	tokens: LegacyRouteToken[];
	handlerName: string;
	subcommandName?: string;
};

type CompiledLegacyDefinition = {
	name: string;
	syntax: string;
	usage: string;
	usageLines: string[];
	routes: LegacyCommandRoute[];
	subcommands: string[];
};

type LegacyCommandParameterOptions = {
	required?: boolean;
	rest?: boolean;
};

export class LegacyCommandError extends Error {}

export const LegacyCommandParam = {
	string(name: string, options?: LegacyCommandParameterOptions) {
		return createLegacyParam(name, 'string', options);
	},
	number(name: string, options?: LegacyCommandParameterOptions) {
		return createLegacyParam(name, 'number', options);
	},
	int(name: string, options?: LegacyCommandParameterOptions) {
		return createLegacyParam(name, 'int', options);
	},
	bool(name: string, options?: LegacyCommandParameterOptions) {
		return createLegacyParam(name, 'bool', options);
	},
};

export class LegacyCommandRegistry {
	private readonly commands = new Collection<string, BaseLegacyCommand>();
	private readonly aliases  = new Collection<string, BaseLegacyCommand>();

	public clear() {
		this.commands.clear();
		this.aliases.clear();
	}

	public register(command: BaseLegacyCommand) {
		if (this.commands.has(command.name)) {
			throw new Error(`Duplicate legacy command name "${command.name}" detected in registry.`);
		}

		this.commands.set(command.name, command);

		for (const name of command.getAllNames()) {
			if (this.aliases.has(name)) {
				throw new Error(`Duplicate legacy command alias "${name}" detected in registry.`);
			}

			this.aliases.set(name, command);
		}
	}

	public get(name: string) {
		return this.aliases.get(name.toLowerCase());
	}

	public getByName(name: string) {
		return this.commands.get(name.toLowerCase());
	}

	public has(name: string) {
		return this.aliases.has(name.toLowerCase());
	}

	public values() {
		return [...this.commands.values()];
	}

	public summaries(): LegacyCommandSummary[] {
		return this.values().map(command => ({
			name: command.name,
			description: command.description,
			syntax: command.syntax,
			usage: command.usage,
			usageLines: command.getUsageLines(),
			aliases: [...command.aliases],
			subcommands: command.getSubcommands(),
			command
		}));
	}
}

export class LegacyCommandArguments {
	private index = 0;

	public constructor(
		private readonly values: string[]
	) {}

	public static parse(input: string): Nullable<ParsedLegacyCommand> {
		const tokens = this.tokenize(input);
		const [commandName, ...args] = tokens;
		if (!commandName) {
			return null;
		}

		return {
			commandName: commandName.toLowerCase(),
			args: new this(args)
		};
	}

	public static tokenize(input: string) {
		const tokens = [] as string[];
		let current = '';
		let quote: Nullable<'"' | '\''> = null;
		let escaping = false;

		for (const char of input) {
			if (escaping) {
				current += char;
				escaping = false;
				continue;
			}

			if (char === '\\') {
				escaping = true;
				continue;
			}

			if (quote) {
				if (char === quote) {
					quote = null;
				} else {
					current += char;
				}

				continue;
			}

			if (char === '"' || char === '\'') {
				quote = char;
				continue;
			}

			if (/\s/.test(char)) {
				if (current.length) {
					tokens.push(current);
					current = '';
				}

				continue;
			}

			current += char;
		}

		if (escaping) {
			current += '\\';
		}

		if (quote) {
			throw new LegacyCommandError(`Unterminated ${quote === '"' ? 'double' : 'single'} quote in command arguments.`);
		}

		if (current.length) {
			tokens.push(current);
		}

		return tokens;
	}

	public get length() {
		return this.values.length;
	}

	public get consumed() {
		return this.index;
	}

	public get remaining() {
		return this.values.length - this.index;
	}

	public get hasNext() {
		return this.remaining > 0;
	}

	public toArray() {
		return [...this.values];
	}

	public remainingToArray() {
		return this.values.slice(this.index);
	}

	public peekString() {
		return this.values[this.index];
	}

	public getString(name: string, required: true): string;
	public getString(name: string, required?: false): Maybe<string>;
	public getString(name: string, required = false) {
		return this.consumeString(name, required);
	}

	public getRest(name: string, required: true): string;
	public getRest(name: string, required?: false): Maybe<string>;
	public getRest(name: string, required = false) {
		const value = this.remainingToArray().join(' ').trim();
		if (!value.length) {
			if (required) {
				throw new LegacyCommandError(`Missing required \`${name}\` argument.`);
			}

			return;
		}

		this.index = this.values.length;
		return value;
	}

	public getNumber(name: string, required: true): number;
	public getNumber(name: string, required?: false): Maybe<number>;
	public getNumber(name: string, required = false) {
		const value = this.consumeString(name, required);
		if (value === undefined) {
			return;
		}

		const parsed = Number(value);
		if (Number.isNaN(parsed)) {
			throw new LegacyCommandError(`Expected \`${name}\` to be a number, got \`${value}\`.`);
		}

		return parsed;
	}

	public getInteger(name: string, required: true): number;
	public getInteger(name: string, required?: false): Maybe<number>;
	public getInteger(name: string, required = false) {
		const value = this.consumeString(name, required);
		if (value === undefined) {
			return;
		}

		const parsed = Number.parseInt(value, 10);
		if (!Number.isInteger(parsed) || parsed.toString() !== value) {
			throw new LegacyCommandError(`Expected \`${name}\` to be an integer, got \`${value}\`.`);
		}

		return parsed;
	}

	public getBool(name: string, required: true): boolean;
	public getBool(name: string, required?: false): Maybe<boolean>;
	public getBool(name: string, required = false) {
		const value = this.consumeString(name, required);
		if (value === undefined) {
			return;
		}

		return coerceBoolean(name, value);
	}

	public expectNone() {
		if (this.hasNext) {
			throw new LegacyCommandError(`Unexpected extra arguments: ${this.remainingToArray().join(' ')}`);
		}
	}

	private consumeString(name: string, required = false) {
		const value = this.values[this.index];
		if (value === undefined) {
			if (required) {
				throw new LegacyCommandError(`Missing required \`${name}\` argument.`);
			}

			return;
		}

		this.index++;

		return value;
	}
}

export class LegacyCommandParameters {
	public readonly values = new Map<string, unknown>();

	public set(name: string, value: unknown) {
		this.values.set(name, value);
	}

	public has(name: string) {
		return this.values.has(name);
	}

	public get(name: string) {
		return this.values.get(name);
	}

	public getString(name: string, required: true): string;
	public getString(name: string, required?: false): Maybe<string>;
	public getString(name: string, required = false) {
		const value = this.getValue(name, required);
		if (value === undefined) {
			return;
		}

		if (typeof value !== 'string') {
			throw new LegacyCommandError(`Parameter \`${name}\` is not a string.`);
		}

		return value;
	}

	public getNumber(name: string, required: true): number;
	public getNumber(name: string, required?: false): Maybe<number>;
	public getNumber(name: string, required = false) {
		const value = this.getValue(name, required);
		if (value === undefined) {
			return;
		}

		if (typeof value !== 'number') {
			throw new LegacyCommandError(`Parameter \`${name}\` is not a number.`);
		}

		return value;
	}

	public getInteger(name: string, required: true): number;
	public getInteger(name: string, required?: false): Maybe<number>;
	public getInteger(name: string, required = false) {
		const value = this.getValue(name, required);
		if (value === undefined) {
			return;
		}

		if (typeof value !== 'number' || !Number.isInteger(value)) {
			throw new LegacyCommandError(`Parameter \`${name}\` is not an integer.`);
		}

		return value;
	}

	public getBool(name: string, required: true): boolean;
	public getBool(name: string, required?: false): Maybe<boolean>;
	public getBool(name: string, required = false) {
		const value = this.getValue(name, required);
		if (value === undefined) {
			return;
		}

		if (typeof value !== 'boolean') {
			throw new LegacyCommandError(`Parameter \`${name}\` is not a boolean.`);
		}

		return value;
	}

	private getValue(name: string, required = false) {
		if (!this.values.has(name)) {
			if (required) {
				throw new LegacyCommandError(`Missing required \`${name}\` argument.`);
			}

			return;
		}

		return this.values.get(name);
	}
}

export abstract class BaseLegacyCommand {
	public readonly name: string;
	public readonly syntax: string;
	public readonly usage: string;
	public readonly description?: string;
	public readonly aliases: string[];
	public readonly logger: LogLayer;

	private readonly definition: CompiledLegacyDefinition;
	private readonly localStorage = new AsyncLocalStorage<LegacyCommandContext>();

	public constructor(options: LegacyCommandOptions) {
		const name = options.name.trim().toLowerCase();
		if (!name.length) {
			throw new Error('Legacy command name cannot be empty.');
		}

		this.name        = name;
		this.description = options.description;
		this.aliases     = (options.aliases ?? []).map(alias => alias.toLowerCase());
		this.logger      = logger.child().withPrefix(`[LegacyCommand(${this.name})]`);
		this.definition  = compileLegacyDefinition({
			...options,
			name
		});
		this.syntax      = this.definition.syntax;
		this.usage       = this.definition.usage;

		this.assertHandlerDefinitions();
	}

	public get ctx(): LegacyCommandContext {
		const context = this.localStorage.getStore();
		if (!context) {
			throw new Error(`No message context available for legacy command \`${this.name}\`.`);
		}

		return context;
	}

	public async callHandler(context: Omit<LegacyCommandContext, 'params' | 'route'>) {
		const match = this.matchRoute(context.args.toArray());
		if (!match) {
			const usage = this.getUsageLines()
				.map(line => `- \`${context.prefix}${line}\``)
				.join('\n');
			throw new LegacyCommandError(`Invalid usage for \`${this.name}\`. Expected one of:\n${usage}`);
		}

		const runContext: LegacyCommandContext = {
			...context,
			subcommandName: match.route.subcommandName,
			params: match.params,
			route: match.route
		};

		return this.localStorage.run(runContext, async () => {
			const handler = this.getHandler(match.route.handlerName);
			return await handler.call(this, context.message);
		});
	}

	public async run(_message: Message): Promise<unknown> {
		throw new LegacyCommandError(`No handler defined for legacy command \`${this.name}\`.`);
	}

	public getAllNames() {
		return [this.name, ...this.aliases];
	}

	public getSubcommands() {
		return [...this.definition.subcommands];
	}

	public getUsageLines() {
		return [...this.definition.usageLines];
	}

	public async reply(options: string | MessagePayload | MessageReplyOptions) {
		if (typeof options === 'string') {
			return this.ctx.message.reply(options);
		}

		return this.ctx.message.reply(options);
	}

	private assertHandlerDefinitions() {
		const missingHandlerNames = this.definition.routes
			.map(route => route.handlerName)
			.filter((name, index, names) => names.indexOf(name) === index)
			.filter(name => typeof (this as Record<string, unknown>)[name] !== 'function');

		if (missingHandlerNames.length === 0) {
			return;
		}

		throw new Error(`Missing legacy command handler(s) for "${this.name}": ${missingHandlerNames.join(', ')}`);
	}

	private getHandler(handlerName: string) {
		const handler = (this as Record<string, unknown>)[handlerName];
		if (typeof handler !== 'function') {
			throw new Error(`Legacy command handler \`${handlerName}\` does not exist for command \`${this.name}\`.`);
		}

		return handler as (message: Message) => Promise<unknown>;
	}

	private matchRoute(values: string[]) {
		for (const route of this.definition.routes) {
			const params = new LegacyCommandParameters();
			let index = 0;
			let failed = false;

			for (const token of route.tokens) {
				if (token.kind === 'literal') {
					const value = values[index]?.toLowerCase();
					if (value !== token.value) {
						failed = true;
						break;
					}

					index++;
					continue;
				}

				if (token.rest) {
					const raw = values.slice(index).join(' ').trim();
					if (!raw.length) {
						if (token.required) {
							failed = true;
						}

						break;
					}

					params.set(token.name, coerceParameter(token.name, raw, token.valueType));
					index = values.length;
					continue;
				}

				const raw = values[index];
				if (raw === undefined) {
					if (token.required) {
						failed = true;
					}

					break;
				}

				params.set(token.name, coerceParameter(token.name, raw, token.valueType));
				index++;
			}

			if (failed || index !== values.length) {
				continue;
			}

			return {
				route,
				params,
			};
		}
	}
}

function compileLegacyDefinition(options: Pick<LegacyCommandOptions, 'name' | 'params' | 'subcommands'>): CompiledLegacyDefinition {
	const params = options.params ?? [];
	const subcommandEntries = Object.entries(options.subcommands ?? {});
	if (params.length > 0 && subcommandEntries.length > 0) {
		throw new Error(`Legacy command "${options.name}" cannot declare both root params and subcommands.`);
	}

	if (subcommandEntries.length > 0) {
		const routes = [] as LegacyCommandRoute[];
		const usageLines = [] as string[];

		for (const [subcommandName, subcommandDefinition] of subcommandEntries) {
			const normalizedName = normalizeLegacyLiteral(subcommandName, `legacy subcommand for "${options.name}"`);
			const routeParams = normalizeLegacySubcommandParams(subcommandDefinition);
			const expanded = expandLegacyParamRoutes(routeParams);

			for (const tokens of expanded) {
				routes.push({
					tokens: [{ kind: 'literal', value: normalizedName }, ...tokens],
					handlerName: normalizedName,
					subcommandName: normalizedName,
				});
			}

			usageLines.push(formatLegacyUsageLine(options.name, normalizedName, routeParams));
		}

		const syntax = `${options.name} <subcommand>`;

		return {
			name: options.name,
			syntax,
			usage: usageLines.join('\n'),
			usageLines,
			routes: routes.sort(compareLegacyRoutes),
			subcommands: subcommandEntries.map(([name]) => name.toLowerCase()),
		};
	}

	const routes = expandLegacyParamRoutes(params).map(tokens => ({
		tokens,
		handlerName: 'run',
	}));

	const suffix = formatLegacyParams(params);
	const syntax = [options.name, suffix].filter(Boolean).join(' ');

	return {
		name: options.name,
		syntax,
		usage: syntax,
		usageLines: [syntax],
		routes: routes.sort(compareLegacyRoutes),
		subcommands: [],
	};
}

function normalizeLegacySubcommandParams(definition: LegacySubcommandDefinition) {
	if (Array.isArray(definition)) {
		return definition;
	}

	return definition.params ?? [];
}

function createLegacyParam(name: string, type: LegacyValueType, options?: LegacyCommandParameterOptions): LegacyCommandParameterDefinition {
	const normalizedName = name.trim();
	if (!normalizedName.length) {
		throw new Error(`Legacy command parameter name cannot be empty for type "${type}".`);
	}

	return {
		name: normalizedName,
		type,
		required: options?.required ?? true,
		rest: options?.rest ?? false,
	};
}

function expandLegacyParamRoutes(params: LegacyCommandParameterDefinition[]) {
	assertLegacyParams(params);

	let routes = [[]] as LegacyRouteToken[][];
	for (const param of params) {
		const token = {
			kind: 'param',
			name: param.name,
			valueType: param.type,
			required: param.required,
			rest: param.rest,
		} satisfies LegacyRouteToken;

		if (param.required) {
			routes = routes.map(route => [...route, token]);
			continue;
		}

		routes = [
			...routes,
			...routes.map(route => [...route, token]),
		];
	}

	return routes;
}

function assertLegacyParams(params: LegacyCommandParameterDefinition[]) {
	let optionalSeen = false;

	for (const [index, param] of params.entries()) {
		if (!param.name.trim().length) {
			throw new Error('Legacy command parameter names cannot be empty.');
		}

		if (param.rest && index !== params.length - 1) {
			throw new Error(`Legacy command rest parameter "${param.name}" must be the last parameter.`);
		}

		if (!param.required) {
			optionalSeen = true;
			continue;
		}

		if (optionalSeen) {
			throw new Error(`Required legacy command parameter "${param.name}" cannot appear after an optional parameter.`);
		}
	}
}

function formatLegacyParams(params: LegacyCommandParameterDefinition[]) {
	return params
		.map(param => {
			const rest = param.rest ? '...' : '';
			const body = `${param.name}:${param.type}${rest}`;
			return param.required ? `<${body}>` : `[${body}]`;
		})
		.join(' ');
}

function formatLegacyUsageLine(commandName: string, subcommandName: string, params: LegacyCommandParameterDefinition[]) {
	const suffix = formatLegacyParams(params);
	return [commandName, subcommandName, suffix].filter(Boolean).join(' ');
}

function normalizeLegacyLiteral(value: string, label: string) {
	const normalized = value.trim().toLowerCase();
	if (!normalized.length) {
		throw new Error(`Empty ${label} is not allowed.`);
	}

	if (/\s/.test(normalized)) {
		throw new Error(`Whitespace is not allowed in ${label} "${value}".`);
	}

	return normalized;
}

function compareLegacyRoutes(a: LegacyCommandRoute, b: LegacyCommandRoute) {
	const aLiteralCount = a.tokens.filter(token => token.kind === 'literal').length;
	const bLiteralCount = b.tokens.filter(token => token.kind === 'literal').length;
	if (aLiteralCount !== bLiteralCount) {
		return bLiteralCount - aLiteralCount;
	}

	return b.tokens.length - a.tokens.length;
}

function coerceParameter(name: string, raw: string, type: LegacyValueType) {
	switch (type) {
		case 'string':
			return raw;
		case 'number': {
			const value = Number(raw);
			if (Number.isNaN(value)) {
				throw new LegacyCommandError(`Expected ${name} to be a number, got "${raw}".`);
			}

			return value;
		}
		case 'int': {
			if (!/^-?\d+$/.test(raw)) {
				throw new LegacyCommandError(`Expected ${name} to be an integer, got "${raw}".`);
			}

			return Number.parseInt(raw, 10);
		}
		case 'bool':
			return coerceBoolean(name, raw);
	}
}

function coerceBoolean(name: string, raw: string) {
	switch (raw.toLowerCase()) {
		case 'true':
		case 't':
		case '1':
		case 'yes':
		case 'y':
		case 'on':
		case 'enable':
		case 'enabled':
			return true;
		case 'false':
		case 'f':
		case '0':
		case 'no':
		case 'n':
		case 'off':
		case 'disable':
		case 'disabled':
			return false;
		default:
			throw new LegacyCommandError(`Expected ${name} to be a boolean, got "${raw}".`);
	}
}
