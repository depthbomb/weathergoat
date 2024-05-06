import type { Awaitable, ClientEvents } from 'discord.js';

type DiscordEventOptions<T extends keyof ClientEvents> = {
	name: T;
	once?: boolean;
};

export abstract class DiscordEvent<T extends keyof ClientEvents> {
	public readonly name: T;
	public readonly once: boolean;

	public constructor(options: DiscordEventOptions<T>) {
		this.name = options.name;
		this.once = options.once ?? false;
	}

	public handle(...args: ClientEvents[T]): Awaitable<any> {
		throw new Error(`Handler not implemented for event ${this.name}`);
	}
}
