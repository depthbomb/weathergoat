import type { WeatherGoat } from '@lib/client';

export type Awaitable<T> = PromiseLike<T> | T;
export type Maybe<T>     = T | undefined;
export type Nullable<T>  = T | null;

declare module 'discord.js' {
	interface BaseInteraction {
		client: WeatherGoat<true>;
	}

	interface Message {
		client: WeatherGoat<true>;
	}

	interface ClientEvents {
		clientReady: [client: WeatherGoat<true>];
	}
}
