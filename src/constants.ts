import { main } from 'bun';
import { join, dirname } from 'node:path';

export const REPO_OWNER = 'depthbomb' as const;
export const REPO_NAME  = 'weathergoat' as const;
export const REPO       = `${REPO_OWNER}/${REPO_NAME}` as const;

export const BOT_USER_AGENT = `WeatherGoat (github: ${REPO})` as const;

export const ROOT_DIR      = dirname(main);
export const PROJECT_ROOT  = join(ROOT_DIR, '..');
export const DATA_DIR      = join(PROJECT_ROOT, '.data');
export const LOGS_DIR      = join(DATA_DIR, 'logs');
export const DATABASE_PATH = join(DATA_DIR, 'weathergoat.db');
export const LOCALES_PATH  = join(PROJECT_ROOT, 'locales');
export const COMMANDS_DIR  = join(ROOT_DIR, 'commands');
export const EVENTS_DIR    = join(ROOT_DIR, 'events');
export const JOBS_DIR      = join(ROOT_DIR, 'jobs');

export const enum Colors {
	Primary          = 0x5876aa,
	Info             = 0x0ea5e9,
	Success          = 0x84cc16,
	Warning          = 0xeab308,
	Danger           = 0xdc2626,
	SeverityUnknown  = 0x9ca3af,
	SeverityMinor    = 0xfbbf24,
	SeverityModerate = 0xf97316,
	SeveritySevere   = 0xdc2626,
	SeverityExtreme  = 0x7f1d1d
}
