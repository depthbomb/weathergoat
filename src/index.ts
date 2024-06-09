import { logger } from '@lib/logger';
import { captureError } from '@lib/errors';
import { serviceManager } from '@services';
import { Partials, GatewayIntentBits } from 'discord.js';

if (process.argv.length > 2) {
	const { runCli } = await import('@cli');
	await runCli();
} else {
	logger.info('Booting up', { mode: process.env.MODE });

	if (process.env.SENTRY_DSN) {
		const { init } = await import('@sentry/bun');

		logger.info('Initializing Sentry');

		init({ dsn: process.env.SENTRY_DSN });
	}

	const { WeatherGoat }     = await import('@lib/client');
	const { alertsService }   = await import('@services/alerts');
	const { cacheService }    = await import('@services/cache');
	const { featuresService } = await import('@services/features');
	const { forecastService } = await import('@services/forecast');
	const { githubService }   = await import('@services/github');
	const { httpService }     = await import('@services/http');
	const { locationService } = await import('@services/location');

	const wg = new WeatherGoat({
		presence: {
			status: 'dnd'
		},
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildWebhooks,
		],
		partials: [Partials.Message, Partials.Channel]
	});

	await serviceManager
		.registerService(alertsService)
		.registerService(cacheService)
		.registerService(featuresService)
		.registerService(forecastService)
		.registerService(githubService)
		.registerService(httpService)
		.registerService(locationService)
		.initializeServices(wg);

	await wg.login(process.env.BOT_TOKEN);

	for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT']) process.on(sig, async () => await wg.destroy());
	for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
		if (err.code !== 'ABORT_ERR') {
			captureError('Unhandled error', err);
			await wg.destroy();
		}

		process.exit(1);
	});
}
