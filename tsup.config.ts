import { defineConfig } from 'tsup';
import { version } from './package.json';
import { execSync } from 'node:child_process';

const { platform }  = process;
const platformWin32 = platform === 'win32';
const platformMacOS = ['macos', 'darwin'].includes(platform);
const platformLinux = ['freebsd', 'openbsd', 'linux'].includes(platform);
const platformOs    = platformWin32 ? 'Windows' : platformMacOS ? 'macOS' : 'Linux';

function getCurrentGitHash(): string {
	let hash = 'initial';
	try {
		hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch (err) {
		console.error(err);
	}

	return hash;
}

export default defineConfig(() => ({
	clean: true,
	entry: ['src/**/*.ts'],
	format: ['cjs'],
	minify: true,
	skipNodeModulesBundle: true,
	splitting: true,
	sourcemap: true,
	target: 'node20',
	tsconfig: './tsconfig.json',
	keepNames: false,
	define: {
		__WIN32__:      JSON.stringify(platformWin32),
		__MACOS__:      JSON.stringify(platformMacOS),
		__LINUX__:      JSON.stringify(platformLinux),
		__PLATFORM__:   JSON.stringify(platformOs),
		__BUILD_DATE__: JSON.stringify(new Date()),
		__BUILD_HASH__: JSON.stringify(getCurrentGitHash()),
		__VERSION__:    JSON.stringify(version),
	}
}));
