import type { ClientEvents } from 'discord.js';

export interface IEvent<K extends keyof ClientEvents = keyof ClientEvents> {
	/**
	 * The event that should be handled.
	 *
	 * @see {@link ClientEvents}
	 */
	event: K;
	/**
	 * Whether the event should only be handled once.
	 */
	once?: boolean;
	/**
	 * Whether the event should be handled.
	 */
	disabled?: boolean;
	/**
	 * Called when the event is handled.
	 * @param args Event args
	 */
	handle(...args: ClientEvents[K]): Promise<void>;
}
