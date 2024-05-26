import { join } from 'node:path';

export const BOT_USER_AGENT = `WeatherGoat (github: depthbomb/weathergoat)`;

export const ROOT_DIR      = __dirname;
export const PROJECT_ROOT  = join(ROOT_DIR, '..');
export const DATA_DIR      = join(PROJECT_ROOT, '.data');
export const LOGS_DIR      = join(DATA_DIR, 'logs');
export const DATABASE_PATH = join(DATA_DIR, 'weathergoat.db');
export const LOCALES_PATH  = join(PROJECT_ROOT, 'locales');
export const COMMANDS_DIR  = join(ROOT_DIR, 'commands');
export const EVENTS_DIR    = join(ROOT_DIR, 'events');
export const JOBS_DIR      = join(ROOT_DIR, 'jobs');
