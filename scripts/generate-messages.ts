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

const inputFile  = process.argv[2] || 'translations.json';
const outputFile = process.argv[3] || 'translations.ts';

function escapeBackticks(str: string): string {
	return str.replace(/`/g, '\\`');
}

function parseTemplate(template: string) {
	const params: IParsedParam[] = [];
	const paramRegex = /{(\w+)(\?)?:([^}=]+)(?:=([^}]+))?}/g;
	let match;

	while ((match = paramRegex.exec(template)) !== null) {
		const name = match[1];
		const optional = match[2] === '?';
		const type = match[3].trim();
		const defaultValue = match[4]?.trim();

		params.push({ name, type, optional, defaultValue });
	}

	return { params, hasPlurals: false };
}

function generateParamSignature(params: IParsedParam[]) {
	if (params.length === 0) return '()';

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
	if (params.some(p => p.name === 'count')) return params;
	return [{ name: 'count', type: 'number', optional: false }, ...params] as IParsedParam[];
}

function templateToString(template: string) {
	return escapeBackticks(template.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));
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
		const pluralKeys = keys.filter(k => k.startsWith('_'));
		if (pluralKeys.length > 0) {
			const templateOne   = value['_one'] as string | string[];
			const templateOther = value['_other'] as string | string[];

			const one   = Array.isArray(templateOne) ? templateOne.join('\n') : templateOne;
			const other = Array.isArray(templateOther) ? templateOther.join('\n') : templateOther;

			const { params: rawParams } = parseTemplate(one || other);
			const params                = ensureCountParam(rawParams);
			const paramsSignature       = generateParamSignature(params);

			const templateOneStr   = templateToString(one);
			const templateOtherStr = templateToString(other);

			lines.push(`${paramsSignature}=>count===1?\`${templateOneStr}\` as const:\`${templateOtherStr}\` as const`);
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

function generateRootObject(data: ITranslationObject) {
	const lines = [] as string[];
	lines.push('{');
	lines.push(`$generated:${JSON.stringify(new Date().toISOString())},`);
	lines.push(`$source:${JSON.stringify(resolve(inputFile))},`);
	lines.push(`$raw:${JSON.stringify(JSON.stringify(data))},`);

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

	writeFileSync(outputFilePath, functions.join('\n'), 'utf-8');

	console.log(`Generated TypeScript file: ${outputFilePath}`);
}

generateTypeScriptFromJSON(inputFile, outputFile);
