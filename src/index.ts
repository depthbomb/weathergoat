if (!process.versions.bun) throw new Error('WeatherGoat must be ran through Bun.');

import { Tokens } from '@container';
import { logger } from '@lib/logger';
import { captureError } from '@lib/errors';
import { Partials, GatewayIntentBits } from 'discord.js';
import type { ICliService } from '@services/cli';
import type { IFeaturesService } from '@services/features';

logger.info('Booting up', { mode: process.env.MODE });

if (process.env.SENTRY_DSN) {
	const { init } = await import('@sentry/bun');

	logger.info('Initializing Sentry');

	init({ dsn: process.env.SENTRY_DSN });
}

const { WeatherGoat } = await import('@lib/client');
const { default: alertsService } = await import('@services/alerts');
const { default: cacheService } = await import('@services/cache');
const { default: cliService } = await import('@services/cli');
const { default: featuresService } = await import('@services/features');
const { default: forecastService } = await import('@services/forecast');
const { default: githubService } = await import('@services/github');
const { default: httpService } = await import('@services/http');
const { default: locationService } = await import('@services/location');

const wg = new WeatherGoat<false>({
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

wg.container
	.registerValue(Tokens.Client, wg)
	.register(Tokens.Alerts, alertsService)
	.register(Tokens.Cache, cacheService)
	.register(Tokens.CLI, cliService)
	.register(Tokens.Features, featuresService)
	.register(Tokens.Forecast, forecastService)
	.register(Tokens.GitHub, githubService)
	.register(Tokens.HTTP, httpService)
	.register(Tokens.Location, locationService);

const features = wg.container.resolve<IFeaturesService>(Tokens.Features);

features.set('com.weathergoat.features.DisableAlertReporting', 0.0, 'Alert reporting killswitch');
features.set('com.weathergoat.features.DisableForecastReporting', 0.0, 'Forecast reporting killswitch');
features.set('com.weathergoat.features.DisableMessageSweeping', 0.0, 'Message sweeping killswitch');
features.set('com.weathergoat.features.DisableRadarMessageUpdating', 0.0, 'Radar message updating killswitch');
features.set('com.weathergoat.features.DisableStatusUpdating', 0.0, 'Status updating killswitch');
features.set('com.weathergoat.features.experiments.AIAlertSummarizing', 0.0, 'Summarizes weather alerts using AI');

if (process.argv.length > 2) {
	const cli = wg.container.resolve<ICliService>(Tokens.CLI);
	await cli.run(process.argv.slice(2));
} else {
	await wg.login(process.env.BOT_TOKEN);
}

for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT']) process.on(sig, async () => await wg.destroy());
for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
	if (err.code !== 'ABORT_ERR') {
		captureError('Unhandled error', err);
		await wg.destroy();
	}

	process.exit(1);
});
