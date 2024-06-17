import type { Awaitable } from 'discord.js';

export interface IService {
	/**
	 * If implemented, called before the application exits.
	 */
	dispose?(): Awaitable<unknown>;
}
