import type { Awaitable } from 'discord.js';

export interface IService {
	/**
	 * If implemented, called right after all services have been registered.
	 */
	init?(): Awaitable<unknown>;
	/**
	 * If implemented, called before the application exits.
	 */
	dispose?(): Awaitable<unknown>;
}

export * from './alerts';
export * from './cache';
export * from './cli';
export * from './features';
export * from './forecast';
export * from './github';
export * from './http';
export * from './location';
export * from './sweeper';
