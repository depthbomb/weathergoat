import type { Awaitable, ClientEvents } from 'discord.js';

export interface IEvent<T extends keyof ClientEvents> {
	/**
	 * The name of the event.
	 */
	name: T;
	/**
	 * Whether the event should only be handled once.
	 *
	 * `false` by default.
	 */
	once?: boolean;
	/**
	 * Whether the event is disabled.
	 *
	 * `false` by default.
	 */
	disabled?: boolean;
	/**
	 * Called when the event is fired.
	 * @param args Event-specific arguments.
	 */
	handle(...args: ClientEvents[T]): Awaitable<unknown>;
}
