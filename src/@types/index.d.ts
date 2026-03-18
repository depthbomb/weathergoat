import type { WeatherGoat } from '@lib/client';

declare module 'discord.js' {
	interface Guild {
		client: WeatherGoat<true>;
	}

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
