import { platform, assertRuntime } from '@depthbomb/node-common/platform';

assertRuntime('bun');

import '@extensions/string';
import '@abraham/reflection';
import 'temporal-polyfill/global';
import { env } from '@env';
import { container } from '@container';
import { WeatherGoat } from '@lib/client';
import { CliService } from '@services/cli';
import { Flag } from '@depthbomb/common/state';
import { logger, reportError } from '@lib/logger';

const shuttingDownFlag = new Flag(false);

async function shutdown(app: WeatherGoat, code: number, reason?: unknown) {
	if (shuttingDownFlag.isTrue) return;

	shuttingDownFlag.setTrue();

	try {
		if (reason && typeof reason === 'object' && (reason as any)?.code !== 'ABORT_ERR') {
			reportError('Shutdown triggered', reason);
		}

		await app.destroy();
	} catch (err) {
		reportError('Error during shutdown', err);
	} finally {
		process.exitCode = code;
	}
}

async function main() {
	const mode = env.get('MODE');
	const sentryDSN = env.get('SENTRY_DSN');

	logger.withMetadata({ mode }).info('Booting');

	if (sentryDSN && mode === 'production') {
		const { init: initSentry } = await import('@sentry/bun');
		initSentry({ dsn: sentryDSN.release() });
	}

	container.bind(WeatherGoat);

	if (process.argv.length > 2) {
		const cli = container.get(CliService);
		await cli.run(process.argv.slice(2));
	} else {
		const wg = container.get(WeatherGoat);
		await wg.start();

		if (platform === 'win32' && mode === 'development') {
			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.setEncoding('utf8');
			process.stdin.on('data', async (data) => {
				const key = data.toString();
				if (['q', 'Q', '\u0003', '\u001b'].includes(key)) {
					await shutdown(wg, 0);
				}
			});
		}

		process.on('SIGINT',   () => shutdown(wg, 0)); // Ctrl+C
		process.on('SIGTERM',  () => shutdown(wg, 0)); // Linux service stop
		process.on('SIGBREAK', () => shutdown(wg, 0)); // Windows Ctrl+Break

		process.on('unhandledRejection', (reason) => reportError('Unhandled rejection', reason));
		process.on('uncaughtException', (err) => {
			reportError('Uncaught exception', err);
			shutdown(wg, 1, err);
		});
	}
}

main().catch(err => {
	reportError('Fatal error in main()', err);
	process.exit(1);
});
