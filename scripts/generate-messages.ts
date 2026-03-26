import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

type TranslationLeaf = string | string[];

interface ITranslationValue {
	[key: string]: TranslationLeaf | ITranslationValue;
}

interface ITranslationObject {
	[key: string]: TranslationLeaf | ITranslationValue;
}

interface IParsedParam {
	name: string;
	type: string;
	optional: boolean;
	defaultValue?: string;
}

interface ILeafEntry {
	path: string;
	params: IParsedParam[];
}

type ConditionalValue = TranslationLeaf | ITranslationValue;

const inputFile  = process.argv[2] || 'translations.json';
const outputFile = process.argv[3] || 'translations.ts';

function escapeBackticks(str: string): string {
	return str.replace(/`/g, '\\`');
}

function parseTemplate(template: string) {
	const params     = [] as IParsedParam[];
	const paramRegex = /{(\w+)(\?)?:([^}=]+)(?:=([^}]+))?}/g;

	let match;

	while ((match = paramRegex.exec(template)) !== null) {
		const name         = match[1];
		const optional     = match[2] === '?';
		const type         = match[3].trim();
		const defaultValue = match[4]?.trim();

		params.push({ name, type, optional, defaultValue });
	}

	return { params, hasPlurals: false };
}

function generateParamSignature(params: IParsedParam[]) {
	if (params.length === 0) {
		return '()';
	}

	const paramStrings = params.map(p => {
		let paramStr = `${p.name}${p.optional ? '?' : ''}:${p.type}`;
		if (p.defaultValue !== undefined) {
			paramStr += `=${p.defaultValue}`;
		}

		return paramStr;
	});

	return `(${paramStrings.join(',')})`;
}

function ensureCountParam(params: IParsedParam[]) {
	if (params.some(p => p.name === 'count')) {
		return params;
	}

	return [{ name: 'count', type: 'number', optional: false }, ...params] as IParsedParam[];
}

function templateToString(template: string) {
	return escapeBackticks(template.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));
}

function collectConditionalParams(value: ConditionalValue): IParsedParam[] {
	if (Array.isArray(value)) {
		value = value.join('\n');
	}

	if (typeof value === 'string') {
		return parseTemplate(value).params;
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.includes('_if')) {
			const condStr   = value['_if'] as string;
			const condMatch = condStr.match(/^(\w+)(\?)?:(.+)$/);
			const condParam = (condMatch
				? { name: condMatch[1], type: condMatch[3].trim(), optional: condMatch[2] === '?' }
				: { name: condStr, type: 'boolean', optional: false }) as IParsedParam;

			const thenVal = (value['_then'] ?? '') as ConditionalValue;
			const elseVal = (value['_else'] ?? '') as ConditionalValue;

			const thenParams = collectConditionalParams(thenVal);
			const elseParams = collectConditionalParams(elseVal);

			const thenNames = new Set(thenParams.map(p => p.name));
			const elseNames = new Set(elseParams.map(p => p.name));

			const mergedParams = [] as IParsedParam[];
			const seen         = new Set<string>();

			for (const p of [...thenParams, ...elseParams]) {
				if (seen.has(p.name)) {
					continue;
				}

				seen.add(p.name);

				const inBoth = thenNames.has(p.name) && elseNames.has(p.name);

				mergedParams.push({ ...p, optional: p.optional || !inBoth });
			}

			return [condParam, ...mergedParams];
		}

		const pluralKeys = keys.filter(k => k.startsWith('_'));
		if (pluralKeys.length > 0) {
			const templateZero  = value['_zero']  as string | string[] | undefined;
			const templateOne   = value['_one']   as string | string[];
			const templateOther = value['_other'] as string | string[];
			const zero          = Array.isArray(templateZero)  ? templateZero.join('\n')  : (templateZero ?? '');
			const one           = Array.isArray(templateOne)   ? templateOne.join('\n')   : templateOne;
			const other         = Array.isArray(templateOther) ? templateOther.join('\n') : templateOther;

			return ensureCountParam(parseTemplate(zero || one || other).params);
		}
	}

	return [];
}

function generateValueExpr(value: ConditionalValue): string {
	if (Array.isArray(value)) value = value.join('\n');

	if (typeof value === 'string') {
		return `\`${templateToString(value)}\` as const`;
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.includes('_if')) {
			const condStr   = value['_if'] as string;
			const condMatch = condStr.match(/^(\w+)(\?)?:(.+)$/);
			const condName  = condMatch ? condMatch[1] : condStr;

			const thenVal = (value['_then'] ?? '') as ConditionalValue;
			const elseVal = (value['_else'] ?? '') as ConditionalValue;

			const thenExpr = generateValueExpr(thenVal);
			const elseExpr = generateValueExpr(elseVal);

			return `${condName}?(${thenExpr}):(${elseExpr})`;
		}

		const pluralKeys = keys.filter(k => k.startsWith('_'));
		if (pluralKeys.length > 0) {
			const templateZero  = value['_zero']  as string | string[] | undefined;
			const templateOne   = value['_one']   as string | string[];
			const templateOther = value['_other'] as string | string[];
			const zero          = Array.isArray(templateZero)  ? templateZero.join('\n')  : (templateZero ?? '');
			const one           = Array.isArray(templateOne)   ? templateOne.join('\n')   : templateOne;
			const other         = Array.isArray(templateOther) ? templateOther.join('\n') : templateOther;

			const zeroExpr  = `\`${templateToString(zero)}\` as const`;
			const oneExpr   = `\`${templateToString(one)}\` as const`;
			const otherExpr = `\`${templateToString(other)}\` as const`;

			if (zero) {
				return `count===0?${zeroExpr}:count===1?${oneExpr}:${otherExpr}`;
			}

			return `count===1?${oneExpr}:${otherExpr}`;
		}
	}

	return '`` as const';
}

function generateMsgObject(value: string | string[] | ITranslationValue) {
	const lines = [] as string[];

	if (Array.isArray(value)) {
		value = value.join('\n');
	}

	if (typeof value === 'string') {
		const { params }      = parseTemplate(value);
		const paramsSignature = generateParamSignature(params);
		const templateStr     = templateToString(value);

		lines.push(`${paramsSignature}=>\`${templateStr}\` as const`);

		return lines;
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.includes('_if')) {
			const params          = collectConditionalParams(value);
			const paramsSignature = generateParamSignature(params);
			const expr            = generateValueExpr(value);

			lines.push(`${paramsSignature}=>${expr}`);

			return lines;
		}

		const pluralKeys = keys.filter(k => k.startsWith('_'));
		if (pluralKeys.length > 0) {
			const templateZero  = value['_zero']  as string | string[] | undefined;
			const templateOne   = value['_one']   as string | string[];
			const templateOther = value['_other'] as string | string[];

			const zero  = Array.isArray(templateZero)  ? templateZero.join('\n')  : (templateZero ?? '');
			const one   = Array.isArray(templateOne)   ? templateOne.join('\n')   : templateOne;
			const other = Array.isArray(templateOther) ? templateOther.join('\n') : templateOther;

			const { params: rawParams } = parseTemplate(zero || one || other);
			const params                = ensureCountParam(rawParams);
			const paramsSignature       = generateParamSignature(params);

			const zeroStr  = templateToString(zero);
			const oneStr   = templateToString(one);
			const otherStr = templateToString(other);

			const expr = zero
				? `count===0?\`${zeroStr}\` as const:count===1?\`${oneStr}\` as const:\`${otherStr}\` as const`
				: `count===1?\`${oneStr}\` as const:\`${otherStr}\` as const`;

			lines.push(`${paramsSignature}=>${expr}`);

			return lines;
		}

		lines.push('{');

		const entries = Object.entries(value);
		entries.forEach(([key, val], index) => {
			const valueLines = generateMsgObject(val as any);
			if (valueLines.length === 1) {
				lines.push(`${key}:${valueLines[0]}${index < entries.length - 1 ? ',' : ''}`);
			} else {
				lines.push(`${key}:${valueLines[0]}`);
				for (let i = 1; i < valueLines.length; i++) {
					lines.push(`${valueLines[i]}`);
				}
				lines[lines.length - 1] =
					`${lines[lines.length - 1]}${index < entries.length - 1 ? ',' : ''}`;
			}
		});

		lines.push(`}`);
	}

	return lines;
}

function collectLeafParams(value: TranslationLeaf | ITranslationValue, path: string): ILeafEntry[] {
	if (Array.isArray(value)) {
		value = value.join('\n');
	}

	if (typeof value === 'string') {
		return [{ path, params: parseTemplate(value).params }];
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.includes('_if')) {
			return [{ path, params: collectConditionalParams(value) }];
		}

		const pluralKeys = keys.filter(k => k.startsWith('_'));
		if (pluralKeys.length > 0) {
			const templateOne   = value['_one'] as string | string[];
			const templateOther = value['_other'] as string | string[];
			const one           = Array.isArray(templateOne) ? templateOne.join('\n') : templateOne;
			const other         = Array.isArray(templateOther) ? templateOther.join('\n') : templateOther;

			return [{ path, params: ensureCountParam(parseTemplate(one || other).params) }];
		}

		const leaves = [] as ILeafEntry[];
		for (const [key, val] of Object.entries(value)) {
			leaves.push(...collectLeafParams(val as TranslationLeaf | ITranslationValue, path ? `${path}.${key}` : key));
		}

		return leaves;
	}

	return [];
}

function generateHelper(data: ITranslationObject): string {
	const leaves = [] as ILeafEntry[];
	for (const [key, val] of Object.entries(data)) {
		leaves.push(...collectLeafParams(val as TranslationLeaf | ITranslationValue, key));
	}

	const lines = [] as string[];
	lines.push('export type MessageParams = {');

	for (const { path, params } of leaves) {
		if (params.length === 0) {
			lines.push(`'${path}': Record<string, never>;`);
		} else {
			const fields = params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join('; ');

			lines.push(`'${path}': { ${fields} };`);
		}
	}

	lines.push('};');
	lines.push('export const $paramOrder: { [K in keyof MessageParams]: ReadonlyArray<string> } = {');

	for (const { path, params } of leaves) {
		lines.push(`'${path}': ${JSON.stringify(params.map(p => p.name))},`);
	}

	lines.push('};');
	lines.push([
		'export function t<K extends keyof MessageParams>(',
		'key: K,',
		'...args: MessageParams[K] extends Record<string, never> ? [] : [params: MessageParams[K]]',
		'): string {',
		'const params = (args[0] ?? {}) as Record<string, unknown>;',
		'const order = $paramOrder[key] as string[];',
		'const parts = (key as string).split(\'.\');',
		'let fn: unknown = $msg;',
		'for (const part of parts) fn = (fn as Record<string, unknown>)[part];',
		'return (fn as (...a: unknown[]) => string)(...order.map(name => params[name]));',
		'}',
	].join('\n'));

	return lines.join('\n');
}

function generateRootObject(data: ITranslationObject) {
	const lines = [] as string[];
	lines.push('{');
	lines.push(`$generatedDate:${JSON.stringify(new Date().toISOString())},`);
	lines.push(`$source:${JSON.stringify(resolve(inputFile))},`);
	// lines.push(`$raw:${JSON.stringify(JSON.stringify(data))},`);

	const entries = Object.entries(data);
	entries.forEach(([key, val], index) => {
		const valueLines = generateMsgObject(val as ITranslationValue);
		if (valueLines.length === 1) {
			lines.push(`${key}:${valueLines[0]}${index < entries.length - 1 ? ',' : ''}`);
		} else {
			lines.push(`${key}:${valueLines[0]}`);

			for (let i = 1; i < valueLines.length; i++) {
				lines.push(`${valueLines[i]}`);
			}

			lines[lines.length - 1] = `${lines[lines.length - 1]}${index < entries.length - 1 ? ',' : ''}`;
		}
	});

	lines.push('}');

	return lines.join('');
}

function generateTypeScriptFromJSON(jsonFilePath: string, outputFilePath: string): void {
	const jsonContent = readFileSync(jsonFilePath, 'utf-8');
	const data        = JSON.parse(jsonContent) as ITranslationObject;
	const functions   = [] as string[];

	functions.push('// Auto-generated translation catalog');
	functions.push('export const $msg=' + generateRootObject(data) + ' as const;');
	functions.push('export type MessageCatalog = typeof $msg;');
	functions.push(generateHelper(data));

	writeFileSync(outputFilePath, functions.join('\n'), 'utf-8');

	console.log(`Generated TypeScript file: ${outputFilePath}`);
}

generateTypeScriptFromJSON(inputFile, outputFile);
