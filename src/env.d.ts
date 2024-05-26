import type { WeatherGoat } from '@lib/client';

declare module 'bun' {
	interface Env {
		MODE: 'production' | 'development';
		BOT_ID: string;
		BOT_TOKEN: string;
		DATABASE_URL: string;
		SENTRY_DSN?: string;
	}
}

declare module 'discord.js' {
	interface BaseInteraction {
		client: WeatherGoat<boolean>;
	}
}
