if (!process.versions.bun) {
	throw new Error('WeatherGoat requires the Bun runtime to operate.');
}

import { WeatherGoat } from '@client';
import { container } from '@container';
import { logger, reportError } from '@logger';
import { Partials, GatewayIntentBits } from 'discord.js';

import cliService from '@services/cli';
import httpService from '@services/http';
import cacheService from '@services/cache';
import alertsService from '@services/alerts';
import githubService from '@services/github';
import sweeperService from '@services/sweeper';
import featuresService from '@services/features';
import locationService from '@services/location';
import forecastService from '@services/forecast';

logger.info('Booting', { mode: process.env.MODE });

if (process.env.SENTRY_DSN && process.env.MODE === 'production') {
	const { init } = await import('@sentry/bun');

	init({ dsn: process.env.SENTRY_DSN });
}

const wg = new WeatherGoat({
	shards: 'auto',
	presence: {
		status: 'dnd'
	},
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildWebhooks
	],
	partials: [Partials.Message, Partials.Channel]
});

await container
	.registerValue('WeatherGoat', wg)
	.register('Alerts', alertsService)
	.register('Cache', cacheService)
	.register('Cli', cliService)
	.register('Features', featuresService)
	.register('Forecast', forecastService)
	.register('Github', githubService)
	.register('Http', httpService)
	.register('Location', locationService)
	.register('Sweeper', sweeperService)
	.init();

if (process.argv.length > 2) {
	const cli = container.resolve('Cli');
	await cli.run(process.argv.slice(2));
} else {
	const features = container.resolve('Features');

	features.set('disable_alert_reporting',        0.0, 'Alert reporting killswitch');
	features.set('disable_forecast_reporting',     0.0, 'Forecast reporting killswitch');
	features.set('disable_message_sweeping',       0.0, 'Message sweeping killswitch');
	features.set('disable_radar_message_updating', 0.0, 'Radar message updating killswitch');
	features.set('disable_status_updating',        0.0, 'Status updating killswitch');

	await wg.login(process.env.BOT_TOKEN);

	for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT']) process.on(sig, async () => {
		await wg.destroy();
		process.exit(0);
	});

	for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
		if (err.code !== 'ABORT_ERR') {
			reportError('Unhandled error', err);
			await wg.destroy();
		}

		process.exit(1);
	});
}
