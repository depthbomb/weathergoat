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
	} satisfies ComponentMatcher;
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
	} satisfies ComponentMatch;
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
