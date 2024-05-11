import { $ } from 'bun';

let hash: string | null = null;

export async function gitHash() {
	if (!hash) {
		try {
			const out = await $`git rev-parse --short HEAD`.text();

			hash = out.trim();
		} catch {
			hash = 'INDEV';
		}
	}

	return hash;
}
