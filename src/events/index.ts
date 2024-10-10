import type { ClientEvents } from 'discord.js';

type EventOptions<T> = {
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
};

export abstract class BaseEvent<T extends keyof ClientEvents> {
	/**
	 * The name of the event.
	 */
	public readonly name: T;
	/**
	 * Whether the event should only be handled once.
	 */
	public readonly once: boolean;
	/**
	 * Whether the event is disabled.
	 */
	public readonly disabled: boolean;

	public constructor(options: EventOptions<T>) {
		this.name = options.name;
		this.once = options.once ?? false;
		this.disabled = options.disabled ?? false;
	}

	/**
	 * Called when the event is emitted.
	 *
	 * @param args {@link ClientEvents}-specific arguments
	 */
	public abstract handle(...args: ClientEvents[T]): Promise<unknown>;
}
