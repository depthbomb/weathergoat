import { EOL } from 'node:os';
import { Logger } from 'tslog';
import { flags } from '@flags';
import { LOGS_DIR } from '@constants';
import { mkdirSync, existsSync } from 'node:fs';
import { createStream } from 'rotating-file-stream';
import type { ILogObject } from 'tslog';

if (!existsSync(LOGS_DIR)) {
	mkdirSync(LOGS_DIR, { recursive: true });
}

const rotatingStream = createStream('weathergoat.log', {
	path: LOGS_DIR,
	size: '5M',
	interval: '1d',
	maxFiles: 7,
	compress: 'gzip'
});

export const logger = new Logger({
	minLevel: flags.dev ? 'silly' : 'info',
	displayFunctionName: false,
	dateTimeTimezone: 'America/Chicago',
	dateTimePattern: 'year-month-day hour:minute:second',
});

logger.attachTransport({
	silly: transport,
	trace: transport,
	debug: transport,
	info: transport,
	warn: transport,
	error: transport,
	fatal: transport,
}, 'silly');

function transport(message: ILogObject): void {
	rotatingStream.write(JSON.stringify(message) + EOL);
}
