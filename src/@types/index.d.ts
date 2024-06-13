import type { WeatherGoat } from '@lib/client';

export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;

declare module 'bun' {
	interface Env {
		MODE: 'production' | 'development';
		OWNER_ID: string;
		BOT_ID: string;
		BOT_TOKEN: string;
		LEGACY_COMMAND_PREFIX?: string;
		DATABASE_URL: string;
		SENTRY_DSN?: string;
		GITHUB_REPO?: string;
		GITHUB_ACCESS_TOKEN?: string;
		MAX_RADAR_CHANNELS_PER_GUILD: number;
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
}
