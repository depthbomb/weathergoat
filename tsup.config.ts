import { defineConfig } from 'tsup';

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
	keepNames: false
}));
