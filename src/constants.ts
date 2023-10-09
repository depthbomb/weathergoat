import { join } from 'node:path';

const { platform } = process;

export const IS_WIN32 = platform === 'win32';
export const IS_LINUX = ['freebsd', 'openbsd', 'linux'].includes(platform);
export const IS_MACOS = ['macos', 'darwin'].includes(platform);

export const ROOT_DIR     = __dirname;
export const PROJECT_ROOT = join(ROOT_DIR, '..');
export const DATA_DIR     = join(PROJECT_ROOT, '.weathergoat');
export const STORE_DIR    = join(DATA_DIR, 'store');
export const LOGS_DIR     = join(DATA_DIR, 'logs');
export const CONFIG_PATH  = join(PROJECT_ROOT, 'config.toml');
