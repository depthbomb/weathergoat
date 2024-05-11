import { join } from 'node:path';

export const BOT_USER_AGENT     = `WeatherGoat (Node.js/${process.version})`;
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const ROOT_DIR      = __dirname;
export const PROJECT_ROOT  = join(ROOT_DIR, '..');
export const DATA_DIR      = join(PROJECT_ROOT, '.data');
export const LOGS_DIR      = join(DATA_DIR, 'logs');
export const DATABASE_PATH = join(DATA_DIR, 'weathergoat.db');
export const COMMANDS_DIR  = join(ROOT_DIR, 'commands');
export const EVENTS_DIR    = join(ROOT_DIR, 'events');
export const JOBS_DIR      = join(ROOT_DIR, 'jobs');
