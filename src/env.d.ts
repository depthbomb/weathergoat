import type { WeatherGoat } from '@lib/client';

declare module 'bun' {
	interface Env {
		BOT_ID: string;
		BOT_TOKEN: string;
		SENTRY_DSN?: string;
	}
}

declare module 'discord.js' {
	interface BaseInteraction {
		client: WeatherGoat<boolean>;
	}
}
