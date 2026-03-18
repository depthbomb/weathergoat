import { readFile, writeFile } from 'node:fs/promises';

const CALVER_PATTERN    = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?$/;
const PACKAGE_JSON_PATH = new URL('../package.json', import.meta.url);
const CONSTANTS_PATH    = new URL('../src/constants.ts', import.meta.url);

type CalVer = {
	year: number;
	month: number;
	day: number;
	revision?: number;
};

function parseCalVer(input: string): CalVer | null {
	const match = CALVER_PATTERN.exec(input.trim());
	if (!match) {
		return null;
	}

	const year     = Number(match[1]);
	const month    = Number(match[2]);
	const day      = Number(match[3]);
	const revision = match[4] ? Number(match[4]) : undefined;

	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day) ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31
	) {
		return null;
	}

	if (revision !== undefined && (!Number.isInteger(revision) || revision < 1 || revision > 99)) {
		return null;
	}

	return { year, month, day, revision };
}

function formatCalVer(calver: CalVer): string {
	const yyyy = String(calver.year);
	const mm   = String(calver.month);
	const dd   = String(calver.day);

	if (calver.revision === undefined) {
		return `${yyyy}.${mm}.${dd}`;
	}

	const rr = String(calver.revision);

	return `${yyyy}.${mm}.${dd}.${rr}`;
}

function sameDate(a: CalVer, b: CalVer): boolean {
	return a.year === b.year && a.month === b.month && a.day === b.day;
}

function getToday(): CalVer {
	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
		day: now.getDate()
	};
}

function bump(current: CalVer): CalVer {
	const today = getToday();
	if (!sameDate(current, today)) {
		return today;
	}

	return { ...today, revision: (current.revision ?? 0) + 1 };
}

async function readPackageJsonCalVer(): Promise<string | undefined> {
	const contents = await readFile(PACKAGE_JSON_PATH, 'utf8');
	const pkg      = JSON.parse(contents) as { calver?: unknown };

	return typeof pkg.calver === 'string' ? pkg.calver : undefined;
}

async function writePackageJsonCalVer(version: string): Promise<void> {
	const contents = await readFile(PACKAGE_JSON_PATH, 'utf8');
	const pkg      = JSON.parse(contents) as Record<string, unknown>;

	pkg.calver = version;

	await writeFile(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, '\t')}\n`, 'utf8');
}

async function readConstantsCalVer(): Promise<string | undefined> {
	const contents = await readFile(CONSTANTS_PATH, 'utf8');
	const match    = contents.match(/export const CALVER = '([^']+)' as const;/);

	return match?.[1];
}

async function writeConstantsCalVer(version: string): Promise<void> {
	const contents = await readFile(CONSTANTS_PATH, 'utf8');
	const updated = contents.replace(
		/export const CALVER = '([^']+)' as const;/,
		`export const CALVER = '${version}' as const;`
	);

	if (updated === contents) {
		throw new Error('Failed to update CALVER in src/constants.ts');
	}

	await writeFile(CONSTANTS_PATH, updated, 'utf8');
}

async function getCurrentCalVer(): Promise<CalVer> {
	const [pkgVersion, constantsVersion] = await Promise.all([
		readPackageJsonCalVer(),
		readConstantsCalVer()
	]);

	const pkgCalVer       = pkgVersion ? parseCalVer(pkgVersion) : null;
	const constantsCalVer = constantsVersion ? parseCalVer(constantsVersion) : null;

	if (pkgVersion && !pkgCalVer) {
		throw new Error(`package.json calver is not valid: ${pkgVersion}`);
	}

	if (constantsVersion && !constantsCalVer) {
		throw new Error(`src/constants.ts CALVER is not valid CalVer: ${constantsVersion}`);
	}

	if (pkgCalVer && constantsCalVer && formatCalVer(pkgCalVer) !== formatCalVer(constantsCalVer)) {
		throw new Error(
			`CalVer mismatch between package.json (${formatCalVer(pkgCalVer)}) and src/constants.ts (${formatCalVer(constantsCalVer)}).`
		);
	}

	return pkgCalVer ?? constantsCalVer ?? getToday();
}

async function setCalVer(version: CalVer): Promise<void> {
	const formatted = formatCalVer(version);

	await Promise.all([writePackageJsonCalVer(formatted), writeConstantsCalVer(formatted)]);

	console.log(formatted);
}

function parseSetInput(value: string | undefined): CalVer {
	if (!value) {
		throw new Error('Missing CalVer. Usage: bun scripts/calver.ts set YYYY.MM.DD[.RR]');
	}

	const parsed = parseCalVer(value);
	if (!parsed) {
		throw new Error(`Invalid CalVer: ${value}. Expected YYYY.MM.DD[.RR]`);
	}

	return parsed;
}

async function main() {
	const [,,command = 'bump', input] = Bun.argv;

	if (command === 'show') {
		const current = await getCurrentCalVer();
		console.log(formatCalVer(current));
		return;
	}

	if (command === 'set') {
		await setCalVer(parseSetInput(input));
		return;
	}

	if (command === 'bump') {
		const current = await getCurrentCalVer();
		await setCalVer(bump(current));
		return;
	}

	throw new Error(`Unknown command: ${command}. Expected one of: show, set, bump`);
}

main().catch(error => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
