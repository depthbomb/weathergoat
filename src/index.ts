if (!process.versions.bun) {
	throw new Error('WeatherGoat requires the Bun runtime to operate.');
}

import '@extensions';
import '@abraham/reflection';
import { env } from '@env';
import { container } from '@container';
import { WeatherGoat } from '@lib/client';
import { logger, reportError } from '@lib/logger';
import { ApiService, CliService, FeaturesService } from '@services';

async function main() {
	const mode      = env.get('MODE');
	const sentryDSN = env.get('SENTRY_DSN');

	logger.withMetadata({ mode }).info('Booting');

	if (sentryDSN && mode === 'production') {
		const { init: initSentry } = await import('@sentry/bun');

		initSentry({ dsn: sentryDSN });
	}

	container.bind(WeatherGoat);

	if (process.argv.length > 2) {
		const cli = container.get(CliService);
		await cli.run(process.argv.slice(2));
	} else {
		const features = container.get(FeaturesService);

		features.set('disable_alert_reporting',        0.0, 'Alert reporting killswitch');
		features.set('disable_forecast_reporting',     0.0, 'Forecast reporting killswitch');
		features.set('disable_message_sweeping',       0.0, 'Message sweeping killswitch');
		features.set('disable_radar_message_updating', 0.0, 'Radar message updating killswitch');
		features.set('disable_status_updating',        0.0, 'Status updating killswitch');

		const wg = container.get(WeatherGoat);
		await wg.start();

		const server = container.get(ApiService);

		process.once('beforeExit', async () => {
			await server.stop();
			await wg.destroy();
			process.exit(0);
		});

		for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
			if (err.code !== 'ABORT_ERR') {
				reportError('Unhandled error', err);
				await server.stop();
				await wg.destroy();
			}

			process.exit(1);
		});
	}
}

main();
