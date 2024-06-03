import { $ } from 'bun';

let hash: string | null = null;

export async function getCurrentCommitHash() {
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

export async function getCommitMessages(count: number): Promise<string[]> {
	const out   = await $`git log -${count} --pretty=%B`.text();
	const lines = out.trim().split(/\n\s*\n/);

	return lines;
}
