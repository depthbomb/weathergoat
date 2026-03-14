import { readFileSync, writeFileSync } from 'node:fs';

interface TranslationValue {
	[key: string]: string | TranslationValue;
}

interface TranslationObject {
	[key: string]: string | TranslationValue;
}

function escapeBackticks(str: string): string {
	return str.replace(/`/g, '\\`');
}

interface ParsedParam {
	name: string;
	type: string;
	optional: boolean;
	defaultValue?: string;
}

function parseTemplate(template: string): { params: ParsedParam[]; hasPlurals: boolean } {
	const params: ParsedParam[] = [];
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

function generateParamSignature(params: ParsedParam[]): string {
	if (params.length === 0) return '()';

	const paramStrings = params.map(p => {
		let paramStr = `${p.name}${p.optional ? '?' : ''}: ${p.type}`;
		if (p.defaultValue !== undefined) {
			paramStr += ` = ${p.defaultValue}`;
		}
		return paramStr;
	});

	return `(${paramStrings.join(', ')})`;
}

function ensureCountParam(params: ParsedParam[]): ParsedParam[] {
	if (params.some(p => p.name === 'count')) return params;
	return [{ name: 'count', type: 'number', optional: false }, ...params];
}

function templateToString(template: string): string {
	return escapeBackticks(template.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));
}

function generateMsgObject(value: string | TranslationValue): string[] {
	const lines: string[] = [];

	if (typeof value === 'string') {
		const { params } = parseTemplate(value);
		const paramsSignature = generateParamSignature(params);
		const templateStr = templateToString(value);
		lines.push(`${paramsSignature} => \`${templateStr}\` as const`);
		return lines;
	}

	if (typeof value === 'object') {
		const keys = Object.keys(value);
		const pluralKeys = keys.filter(k => k.startsWith('_'));

		if (pluralKeys.length > 0) {
			const templateOne = value['_one'] as string;
			const templateOther = value['_other'] as string;

			const { params: rawParams } = parseTemplate(templateOne || templateOther);
			const params = ensureCountParam(rawParams);
			const paramsSignature = generateParamSignature(params);

			const templateOneStr = templateToString(templateOne);
			const templateOtherStr = templateToString(templateOther);

			lines.push(`${paramsSignature} => {`);
			lines.push(`if (count === 1) {`);
			lines.push(`return \`${templateOneStr}\` as const;`);
			lines.push(`}`);
			lines.push(`return \`${templateOtherStr}\` as const;`);
			lines.push(`}`);
			return lines;
		}

		lines.push('{');
		const entries = Object.entries(value);
		entries.forEach(([key, val], index) => {
			const valueLines = generateMsgObject(val);
			if (valueLines.length === 1) {
				lines.push(`${key}: ${valueLines[0]}${index < entries.length - 1 ? ',' : ''}`);
			} else {
				lines.push(`${key}: ${valueLines[0]}`);
				for (let i = 1; i < valueLines.length; i++) {
					lines.push(`${valueLines[i]}`);
				}
				lines[lines.length - 1] = `${lines[lines.length - 1]}${index < entries.length - 1 ? ',' : ''}`;
			}
		});
		lines.push(`}`);
	}

	return lines;
}

function generateTypeScriptFromJSON(jsonFilePath: string, outputFilePath: string): void {
	const jsonContent = readFileSync(jsonFilePath, 'utf-8');
	const data: TranslationObject = JSON.parse(jsonContent);

	const functions: string[] = [];
	functions.push('// Auto-generated translation catalog');
	functions.push('export const $msg = ' + generateMsgObject(data).join('') + ' as const;');
	functions.push('export type MessageCatalog = typeof $msg;');

	writeFileSync(outputFilePath, functions.join('\n'), 'utf-8');
	console.log(`Generated TypeScript file: ${outputFilePath}`);
}

const inputFile  = process.argv[2] || 'translations.json';
const outputFile = process.argv[3] || 'translations.ts';

generateTypeScriptFromJSON(inputFile, outputFile);
