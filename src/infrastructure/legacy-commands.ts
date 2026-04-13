import { logger } from '@lib/logger';
import { Collection } from 'discord.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogLayer } from 'loglayer';
import type { Maybe, Nullable } from '@depthbomb/common/typing';
import type { Message, MessagePayload, MessageReplyOptions } from 'discord.js';

type LegacyValueType = 'string' | 'number' | 'int' | 'bool';

type LegacyCommandContext = {
	message: Message;
	args: LegacyCommandArguments;
	prefix: string;
	invokedName: string;
	subcommandName?: string;
	commands: LegacyCommandRegistry;
	params: LegacyCommandParameters;
	route: LegacyCommandRoute;
};

type LegacyCommandOptions = {
	syntax: string;
	description?: string;
	aliases?: string[];
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
	aliases: string[];
	subcommands: string[];
	command: BaseLegacyCommand;
};

type LegacySyntaxNode = LegacyLiteralNode | LegacyParamNode | LegacyChoiceNode | LegacyOptionalNode;

type LegacyLiteralNode = {
	kind: 'literal';
	value: string;
};

type LegacyParamNode = {
	kind: 'param';
	name: string;
	valueType: LegacyValueType;
	required: boolean;
	rest: boolean;
};

type LegacyChoiceNode = {
	kind: 'choice';
	alternatives: Array<LegacySyntaxNode[]>;
};

type LegacyOptionalNode = {
	kind: 'optional';
	sequence: LegacySyntaxNode[];
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
};

type CompiledLegacySyntax = {
	name: string;
	syntax: string;
	usage: string;
	routes: LegacyCommandRoute[];
	subcommands: string[];
};

export class LegacyCommandError extends Error {}

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

	private readonly definition: CompiledLegacySyntax;
	private readonly localStorage = new AsyncLocalStorage<LegacyCommandContext>();

	public constructor(options: LegacyCommandOptions) {
		this.definition  = compileLegacySyntax(options.syntax);
		this.name        = this.definition.name;
		this.syntax      = this.definition.syntax;
		this.usage       = this.definition.usage;
		this.description = options.description;
		this.aliases     = (options.aliases ?? []).map(alias => alias.toLowerCase());
		this.logger      = logger.child().withPrefix(`[LegacyCommand(${this.name})]`);
	}

	public get ctx() {
		return this.localStorage.getStore();
	}

	public async callHandler(context: Omit<LegacyCommandContext, 'params' | 'route'>) {
		const match = this.matchRoute(context.args.toArray());
		if (!match) {
			throw new LegacyCommandError(`Invalid usage for \`${this.name}\`. Expected: \`${context.prefix}${this.syntax}\``);
		}

		const runContext: LegacyCommandContext = {
			...context,
			subcommandName: match.subcommandName,
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

	public async reply(options: string | MessagePayload | MessageReplyOptions) {
		const message = this.ctx?.message;
		if (!message) {
			throw new Error(`No message context available for legacy command \`${this.name}\`.`);
		}

		if (typeof options === 'string') {
			return message.reply(options);
		}

		return message.reply(options);
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

			const firstLiteral = route.tokens.find(token => token.kind === 'literal');
			return {
				route,
				params,
				subcommandName: firstLiteral?.kind === 'literal' ? firstLiteral.value : undefined
			};
		}
	}
}

function compileLegacySyntax(syntax: string): CompiledLegacySyntax {
	const trimmed = syntax.trim();
	if (!trimmed.length) {
		throw new Error('Legacy command syntax cannot be empty.');
	}

	const tokens = tokenizeLegacySyntax(trimmed);
	const [name, ...rest] = tokens;
	if (!name || isSyntaxControlToken(name)) {
		throw new Error(`Invalid legacy command syntax "${syntax}".`);
	}

	const parser = createLegacySyntaxParser(rest);
	const nodes = parser.parseSequence();
	parser.expectEnd();

	const routes = expandLegacyNodes(nodes)
		.map(tokens => ({
			tokens,
			handlerName: getLegacyRouteHandlerName(tokens)
		}))
		.sort(compareLegacyRoutes);

	const subcommands = [...new Set(
		routes
			.map(route => route.tokens.find(token => token.kind === 'literal'))
			.filter((token): token is Extract<LegacyRouteToken, { kind: 'literal' }> => Boolean(token))
			.map(token => token.value)
	)];

	return {
		name: name.toLowerCase(),
		syntax: trimmed,
		usage: trimmed,
		routes,
		subcommands
	};
}

function tokenizeLegacySyntax(input: string) {
	const tokens = [] as string[];
	let current = '';

	for (const char of input) {
		if (/\s/.test(char)) {
			if (current.length) {
				tokens.push(current);
				current = '';
			}

			continue;
		}

		if (['<', '>', '[', ']', '|'].includes(char)) {
			if (current.length) {
				tokens.push(current);
				current = '';
			}

			tokens.push(char);
			continue;
		}

		current += char;
	}

	if (current.length) {
		tokens.push(current);
	}

	return tokens;
}

function createLegacySyntaxParser(tokens: string[]) {
	let index = 0;

	function peek() {
		return tokens[index];
	}

	function consume(expected?: string) {
		const token = tokens[index];
		if (token === undefined) {
			throw new Error('Unexpected end of legacy command syntax.');
		}

		if (expected && token !== expected) {
			throw new Error(`Expected "${expected}" in legacy command syntax, got "${token}".`);
		}

		index++;
		return token;
	}

	function parseSequence(stopTokens = new Set<string>()) {
		const nodes = [] as LegacySyntaxNode[];

		while (index < tokens.length) {
			const token = peek();
			if (!token || stopTokens.has(token)) {
				break;
			}

			if (token === '<') {
				nodes.push(parseRequiredGroup());
				continue;
			}

			if (token === '[') {
				nodes.push(parseOptionalGroup());
				continue;
			}

			if (token === '>' || token === ']' || token === '|') {
				break;
			}

			nodes.push(parseLiteral(token));

			index++;
		}

		return nodes;
	}

	function parseRequiredGroup(): LegacySyntaxNode {
		consume('<');
		const alternatives = parseAlternatives('>');
		consume('>');

		if (alternatives.length === 1 && alternatives[0].length === 1 && alternatives[0][0]?.kind === 'param') {
			return {
				...alternatives[0][0],
				required: true
			};
		}

		return {
			kind: 'choice',
			alternatives
		};
	}

	function parseOptionalGroup(): LegacySyntaxNode {
		consume('[');
		const alternatives = parseAlternatives(']');
		consume(']');

		if (alternatives.length === 1 && alternatives[0].length === 1 && alternatives[0][0]?.kind === 'param') {
			return {
				...alternatives[0][0],
				required: false
			};
		}

		if (alternatives.length > 1) {
			throw new Error('Optional legacy syntax groups cannot contain alternatives.');
		}

		return {
			kind: 'optional',
			sequence: alternatives[0] ?? []
		};
	}

	function parseAlternatives(endToken: string) {
		const alternatives = [] as LegacySyntaxNode[][];

		while (index < tokens.length) {
			alternatives.push(parseSequence(new Set([endToken, '|'])));

			if (peek() !== '|') {
				break;
			}

			consume('|');
		}

		return alternatives;
	}

	function parseLiteral(token: string): LegacySyntaxNode {
		const param = parseParamToken(token);
		if (param) {
			return {
				...param,
				required: true
			};
		}

		return {
			kind: 'literal',
			value: token.toLowerCase()
		};
	}

	function expectEnd() {
		if (index < tokens.length) {
			throw new Error(`Unexpected token "${tokens[index]}" in legacy command syntax.`);
		}
	}

	return {
		parseSequence,
		expectEnd
	};
}

function parseParamToken(token: string): Nullable<Omit<LegacyParamNode, 'required'>> {
	const match = /^(?<name>[\w-]+):(?<type>string|number|int|bool)(?<rest>\.\.\.)?$/.exec(token);
	if (!match?.groups) {
		return null;
	}

	return {
		kind: 'param',
		name: match.groups.name,
		valueType: match.groups.type as LegacyValueType,
		rest: Boolean(match.groups.rest)
	};
}

function expandLegacyNodes(nodes: LegacySyntaxNode[]) {
	let routes = [[]] as LegacyRouteToken[][];

	for (const node of nodes) {
		if (node.kind === 'literal') {
			routes = routes.map(route => [...route, { kind: 'literal', value: node.value }]);
			continue;
		}

		if (node.kind === 'param') {
			routes = routes.map(route => [...route, {
				kind: 'param',
				name: node.name,
				valueType: node.valueType,
				required: node.required,
				rest: node.rest
			}]);
			continue;
		}

		if (node.kind === 'optional') {
			const expandedOptional = expandLegacyNodes(node.sequence);
			routes = [
				...routes,
				...routes.flatMap(route => expandedOptional.map(optionalRoute => [...route, ...optionalRoute]))
			];
			continue;
		}

		if (node.kind === 'choice') {
			const nextRoutes = [] as Array<LegacyRouteToken[]>;
			for (const route of routes) {
				for (const alternative of node.alternatives) {
					for (const expanded of expandLegacyNodes(alternative)) {
						nextRoutes.push([...route, ...expanded]);
					}
				}
			}

			routes = nextRoutes;
		}
	}

	return routes;
}

function compareLegacyRoutes(a: LegacyCommandRoute, b: LegacyCommandRoute) {
	const aLiteralCount = a.tokens.filter(token => token.kind === 'literal').length;
	const bLiteralCount = b.tokens.filter(token => token.kind === 'literal').length;
	if (aLiteralCount !== bLiteralCount) {
		return bLiteralCount - aLiteralCount;
	}

	return b.tokens.length - a.tokens.length;
}

function getLegacyRouteHandlerName(tokens: LegacyRouteToken[]) {
	const literals = tokens.filter((token): token is Extract<LegacyRouteToken, { kind: 'literal' }> => token.kind === 'literal');
	return literals.at(-1)?.value ?? 'run';
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

function isSyntaxControlToken(token: string) {
	return ['<', '>', '[', ']', '|'].includes(token);
}
