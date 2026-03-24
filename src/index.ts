if (!process.versions.bun) {
	throw new Error('WeatherGoat requires the Bun runtime to operate.');
}

import '@extensions/string';
import '@abraham/reflection';
import 'temporal-polyfill/global';
import { env } from '@env';
import { container } from '@container';
import { WeatherGoat } from '@lib/client';
import { CliService } from '@services/cli';
import { logger, reportError } from '@lib/logger';
import { Flag } from '@lib/flag';

const shuttingDownFlag = new Flag(false);

async function shutdown(app: WeatherGoat, code: number, reason?: unknown) {
	if (shuttingDownFlag.isTrue) {
		return;
	}

	shuttingDownFlag.setTrue();

	try {
		if (reason && typeof reason === 'object' && (reason as any)?.code !== 'ABORT_ERR') {
			reportError('Shutdown triggered', reason);
		}

		await app.destroy();
	} catch (err) {
		reportError('Error during shutdown', err);
	} finally {
		process.exit(code);
	}
}

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

		process.on('SIGINT',  () => shutdown(wg, 0));
		process.on('SIGTERM', () => shutdown(wg, 0));

		process.on('unhandledRejection', (reason) => {
			reportError('Unhandled rejection', reason);
		});

		process.on('uncaughtException', (err) => {
			reportError('Uncaught exception', err);
			shutdown(wg, 1, err);
		});

		process.on('unhandledRejection', (reason) => {
			reportError('Unhandled rejection', reason);

			if (reason instanceof Error) {
				shutdown(wg, 1, reason);
			}
		});
	}
}

main().catch(err => {
	reportError('Fatal error in main()', err);
	process.exit(1);
});
