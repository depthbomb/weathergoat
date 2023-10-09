import { stat } from 'node:fs/promises';
import { Duration } from '@sapphire/time-utilities';

export async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export async function wait(duration: number): Promise<void>;
export async function wait(duration: string): Promise<void>;
export async function wait(duration: number | string): Promise<void> {
	let offset: number;
	if (typeof duration === 'string') {
		offset = new Duration(duration).offset;
	} else {
		offset = duration;
	}

	return new Promise((res) => setTimeout(() => res(), offset));
}
