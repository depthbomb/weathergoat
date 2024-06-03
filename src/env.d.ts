import type { WeatherGoat } from '@lib/client';

declare module 'bun' {
	interface Env {
		MODE: 'production' | 'development';
		BOT_ID: string;
		BOT_TOKEN: string;
		DATABASE_URL: string;
		SENTRY_DSN?: string;
		MAX_RADAR_CHANNELS_PER_GUILD: number;
		MAX_ALERT_DESTINATIONS_PER_GUILD: number;
		MAX_FORECAST_DESTINATIONS_PER_GUILD: number;
	}
}

declare module 'discord.js' {
	interface BaseInteraction {
		client: WeatherGoat<boolean>;
	}
}
