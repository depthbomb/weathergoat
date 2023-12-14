import type { WeatherGoat } from '@client';

declare global {
	declare const __WIN32__:      boolean;
	declare const __MACOS__:      boolean;
	declare const __LINUX__:      boolean;
	declare const __PLATFORM__:   string;
	declare const __BUILD_DATE__: string;
	declare const __BUILD_HASH__: string;
	declare const __VERSION__:    string;
}

declare module 'discord.js' {
	// We extend the base BaseInteraction interface so we can have proper autocompletion for our
	// extended client.
	interface BaseInteraction {
		client: WeatherGoat;
	}
}
