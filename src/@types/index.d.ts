import type { WeatherGoat } from '@lib/client';

export type Awaitable<T> = PromiseLike<T> | T;
export type Maybe<T>     = T | undefined;
export type Nullable<T>  = T | null;

declare module 'bun' {
	interface Env {
		MODE: 'production' | 'development';
		BOT_ID: string;
		BOT_TOKEN: string;
		SENTRY_DSN?: string;
		GITHUB_ACCESS_TOKEN?: string;
		MAX_RADAR_MESSAGES_PER_GUILD: number;
		MAX_ALERT_DESTINATIONS_PER_GUILD: number;
		MAX_FORECAST_DESTINATIONS_PER_GUILD: number;
	}
}

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
