import { stat } from 'node:fs/promises';
import { Duration } from '@sapphire/time-utilities';

/**
 * Returns `true` if the path exists and is a file, `false` otherwise.
 *
 * @param path Path to the file
 */
export async function fileExists(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);
		return stats.isFile();
	} catch {
		return false;
	}
}

/**
 * Returns `true` if the path exists and is a directory, `false` otherwise.
 *
 * @param path Path to the directory
 */
export async function dirExists(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);
		return stats.isDirectory();
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
