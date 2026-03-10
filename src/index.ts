if (!process.versions.bun) {
	throw new Error('WeatherGoat requires the Bun runtime to operate.');
}

import '@extensions/string';
import '@abraham/reflection';
import { env } from '@env';
import { container } from '@container';
import { WeatherGoat } from '@lib/client';
import { CliService } from '@services/cli';
import { logger, reportError } from '@lib/logger';

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
		const wg = container.get(WeatherGoat);
		await wg.start();

		process.once('beforeExit', async () => {
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
