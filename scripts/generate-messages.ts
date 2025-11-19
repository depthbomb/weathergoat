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

function generateFunctionName(path: string[]): string {
	const [first, ...rest] = path;
	const camelRest = rest
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');
	return `$${first}${camelRest}`;
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

function generateJSDoc(path: string[], params: ParsedParam[]): string[] {
	const lines: string[] = [];
	lines.push('/**');
	lines.push(` * Translation key: \`${path.join('.')}\``);

	if (params.length > 0) {
		params.forEach(p => {
			const optional = p.optional ? ' (optional)' : '';
			const defaultVal = p.defaultValue !== undefined ? ` (default: ${p.defaultValue})` : '';
			lines.push(` * @param ${p.name} - ${p.type}${optional}${defaultVal}`);
		});
	}

	lines.push(` * @returns The translated string`);
	lines.push(' */');

	return lines;
}

function generateFunction(path: string[], value: string | TranslationValue): string[] {
	const functions: string[] = [];

	if (typeof value === 'string') {
		const fnName = generateFunctionName(path);
		const { params } = parseTemplate(value);

		const paramsSignature = generateParamSignature(params);

		let templateStr = escapeBackticks(value.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));

		functions.push(...generateJSDoc(path, params));
		functions.push(`export function ${fnName}${paramsSignature} {`);
		functions.push(`\treturn \`${templateStr}\` as const;`);
		functions.push(`}`);
	} else if (typeof value === 'object') {
		const keys = Object.keys(value);
		const pluralKeys = keys.filter(k => k.startsWith('_'));

		if (pluralKeys.length > 0) {
			const fnName = generateFunctionName(path);
			const templateOne = value['_one'] as string;
			const templateOther = value['_other'] as string;

			const { params } = parseTemplate(templateOne || templateOther);
			const paramsSignature = generateParamSignature(params);

			const templateOneStr = escapeBackticks(templateOne.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));
			const templateOtherStr = escapeBackticks(templateOther.replace(/{(\w+)\??:[^}=]+(?:=[^}]+)?}/g, '${$1}'));

			functions.push('/**');
			functions.push(` * Translation key: ${path.join('.')} (plural form)`);
			params.forEach(p => {
				const optional = p.optional ? ' (optional)' : '';
				const defaultVal = p.defaultValue !== undefined ? ` (default: ${p.defaultValue})` : '';
				functions.push(` * @param ${p.name} - ${p.type}${optional}${defaultVal}`);
			});
			functions.push(` * @returns The translated string (singular or plural)`);
			functions.push(' */');

			functions.push(`export function ${fnName}${paramsSignature} {`);
			functions.push(`\tif (count === 1) {`);
			functions.push(`\t\treturn \`${templateOneStr}\` as const;`);
			functions.push(`\t} else {`);
			functions.push(`\t\treturn \`${templateOtherStr}\` as const;`);
			functions.push(`\t}`);
			functions.push(`}`);
		} else {
			for (const [key, val] of Object.entries(value)) {
				functions.push(...generateFunction([...path, key], val));
			}
		}
	}

	return functions;
}

function generateTypeScriptFromJSON(jsonFilePath: string, outputFilePath: string): void {
	const jsonContent = readFileSync(jsonFilePath, 'utf-8');
	const data: TranslationObject = JSON.parse(jsonContent);

	const functions: string[] = [];
	functions.push('// Auto-generated translation functions');

	for (const [key, value] of Object.entries(data)) {
		functions.push(...generateFunction([key], value));
	}

	writeFileSync(outputFilePath, functions.join('\n'), 'utf-8');
	console.log(`Generated TypeScript file: ${outputFilePath}`);
}

const inputFile = process.argv[2] || 'translations.json';
const outputFile = process.argv[3] || 'translations.ts';

generateTypeScriptFromJSON(inputFile, outputFile);
