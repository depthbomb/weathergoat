if (!process.versions.bun) {
	throw new Error('WeatherGoat requires the Bun runtime to operate.');
}

import '@abraham/reflection';
import { WeatherGoat } from '@lib/client';
import { container } from '@container';
import { logger, reportError } from '@lib/logger';
import { Partials, GatewayIntentBits } from 'discord.js';

import {
	CliService,
	HttpService,
	CacheService,
	AlertsService,
	GithubService,
	SweeperService,
	FeaturesService,
	LocationService,
	ForecastService
} from '@services';

async function main() {
	logger.info('Booting', { mode: process.env.MODE });

	if (process.env.SENTRY_DSN && process.env.MODE === 'production') {
		const { init: initSentry } = await import('@sentry/bun');

		initSentry({ dsn: process.env.SENTRY_DSN });
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

	container.registerValue(WeatherGoat, wg)
             .registerClass(AlertsService)
             .registerClass(CacheService)
             .registerClass(CliService)
             .registerClass(FeaturesService)
             .registerClass(ForecastService)
             .registerClass(GithubService)
             .registerClass(HttpService)
             .registerClass(LocationService)
             .registerClass(SweeperService);

	if (process.argv.length > 2) {
		const cli = container.resolve(CliService);
		await cli.run(process.argv.slice(2));
	} else {
		const features = container.resolve(FeaturesService);

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
}

main();
