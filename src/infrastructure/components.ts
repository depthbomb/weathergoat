import { logger } from '@lib/logger';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogLayer } from 'loglayer';
import type { MessageComponentInteraction } from 'discord.js';
import type { Maybe, Arrayable } from '@depthbomb/common/typing';

type ComponentOptions = {
	/**
	 * The custom_id pattern(s) this component handler matches.
	 *
	 * Supports Discord.NET-style wildcards via `*`.
	 * Example: `button:*`.
	 */
	customId: Arrayable<string>;
	/**
	 * Optional display name for logging.
	 */
	name?: string;
};

type ComponentContext = {
	interaction: MessageComponentInteraction;
	match: ComponentMatch;
};

export type ComponentMatcher = {
	pattern: string;
	regex: RegExp;
	wildcardCount: number;
	specificity: number;
};

export type ComponentMatch = {
	pattern: string;
	customId: string;
	wildcards: string[];
	exact: boolean;
	wildcardCount: number;
	specificity: number;
};

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createComponentMatcher(pattern: string) {
	const wildcardCount = (pattern.match(/\*/g) ?? []).length;
	const parts         = pattern.split('*').map(escapeRegex);
	const regexSource   = `^${parts.join('(.*?)')}$`;

	return {
		pattern,
		regex: new RegExp(regexSource),
		wildcardCount,
		specificity: pattern.length - wildcardCount
	} as ComponentMatcher;
}

export function toComponentMatch(matcher: ComponentMatcher, customId: string) {
	const match = matcher.regex.exec(customId);
	if (!match) {
		return;
	}

	return {
		pattern: matcher.pattern,
		customId,
		wildcards: match.slice(1),
		exact: matcher.wildcardCount === 0 && matcher.pattern === customId,
		wildcardCount: matcher.wildcardCount,
		specificity: matcher.specificity
	} as ComponentMatch;
}

export function compareComponentMatch(a: ComponentMatch, b: ComponentMatch) {
	if (a.exact !== b.exact) {
		return a.exact ? 1 : -1;
	}

	if (a.specificity !== b.specificity) {
		return a.specificity > b.specificity ? 1 : -1;
	}

	if (a.wildcardCount !== b.wildcardCount) {
		return a.wildcardCount < b.wildcardCount ? 1 : -1;
	}

	if (a.pattern.length !== b.pattern.length) {
		return a.pattern.length > b.pattern.length ? 1 : -1;
	}

	return 0;
}

export abstract class BaseComponent {
	public readonly name: string;
	public readonly customIds: string[];
	public readonly logger: LogLayer;

	private readonly localStorage: AsyncLocalStorage<ComponentContext>;
	private readonly matchers: ComponentMatcher[];

	public constructor(options: ComponentOptions) {
		this.customIds    = Array.isArray(options.customId) ? options.customId : [options.customId];
		this.name         = options.name ?? this.customIds.join(', ');
		this.logger       = logger.child().withPrefix(`[Component(${this.name})]`);
		this.localStorage = new AsyncLocalStorage();
		this.matchers     = this.customIds.map(createComponentMatcher);
	}

	/**
	 * When called via {@link callHandler} contains information specific to that component call.
	 */
	public get ctx() {
		return this.localStorage.getStore();
	}

	public getMatch(customId: string): Maybe<ComponentMatch> {
		let best: Maybe<ComponentMatch>;
		for (const matcher of this.matchers) {
			const match = toComponentMatch(matcher, customId);
			if (!match) {
				continue;
			}

			if (!best || compareComponentMatch(match, best) > 0) {
				best = match;
			}
		}

		return best;
	}

	public async callHandler(interaction: MessageComponentInteraction, match: ComponentMatch): Promise<unknown> {
		return this.localStorage.run({ interaction, match }, async () => await this.handle(interaction, match));
	}

	public abstract handle(interaction: MessageComponentInteraction, match: ComponentMatch): Promise<unknown>;
}
