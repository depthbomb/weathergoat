import { logger } from '@lib/logger';
import { WeatherGoat } from '@lib/client';
import { captureError } from '@lib/errors';
import { Partials, GatewayIntentBits } from 'discord.js';

if (process.argv.length > 2) {
	const { runCli } = await import('@cli');
	await runCli();
} else {
	logger.info('Booting up', { mode: process.env.MODE });

	if (process.env.SENTRY_DSN) {
		const { init } = await import('@sentry/bun');

		init({ dsn: process.env.SENTRY_DSN });
	}

	const { container }       = await import('tsyringe');
	const { Tokens }          = await import('@tokens');
	const { WeatherGoat }     = await import('@lib/client');
	const { HttpService }     = await import('@services/http');
	const { AlertsService }   = await import('@services/alerts');
	const { ForecastService } = await import('@services/forecast');
	const { LocationService } = await import('@services/location');

	container.register(Tokens.Http, HttpService);
	container.register(Tokens.Alerts, AlertsService);
	container.register(Tokens.Forecast, ForecastService);
	container.register(Tokens.Location, LocationService);
	container.register('Client', {
			useValue: new WeatherGoat({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildWebhooks,
			],
			partials: [Partials.Message, Partials.Channel]
		})
	});

	const wg = container.resolve<WeatherGoat<boolean>>('Client');
	await wg.login(process.env.BOT_TOKEN);

	for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT']) process.on(sig, async () => await wg.destroy());
	for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
		captureError('Unhandled error', err);
		await wg.destroy();
		process.exit(1);
	});
}
