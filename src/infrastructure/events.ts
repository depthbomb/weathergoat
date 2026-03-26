import { logger } from '@lib/logger';
import type { LogLayer } from 'loglayer';
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
	/**
	 * A {@link LogLayer} instance.
	 */
	public readonly logger: LogLayer;

	public constructor(options: EventOptions<T>) {
		this.name     = options.name;
		this.once     = options.once ?? false;
		this.disabled = options.disabled ?? false;
		this.logger   = logger.child().withPrefix(`[Event(${this.name})]`);
	}

	/**
	 * Called when the event is emitted.
	 *
	 * @param args {@link ClientEvents|Event}-specific arguments.
	 */
	public abstract handle(...args: ClientEvents[T]): Promise<unknown>;
}
