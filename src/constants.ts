import { join } from 'node:path';

export const BOOT_DATE  = new Date();
export const BUILD_DATE = new Date(__BUILD_DATE__);

export const ROOT_DIR     = __dirname;
export const PROJECT_ROOT = join(ROOT_DIR, '..');
export const DATA_DIR     = join(PROJECT_ROOT, '.data');
export const STORE_DIR    = join(DATA_DIR, 'store');
export const LOGS_DIR     = join(DATA_DIR, 'logs');
export const CONFIG_PATH  = join(PROJECT_ROOT, '.weathergoatrc');
