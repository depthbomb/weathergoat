import 'reflect-metadata';
import 'source-map-support/register';
import { client } from '@client';
import { logger } from '@logger';
import { startWebServer } from '@web';
import * as Sentry from '@sentry/node';
import { Stopwatch } from '@sapphire/stopwatch';
import { loadConfig, getOrThrow } from '@config';

async function boot(): Promise<void> {
	const startupSw = new Stopwatch();

	await loadConfig();

	Sentry.init({ dsn: getOrThrow<string>('sentry.dsn') });

	for (const shutdownSignal of ['SIGINT', 'SIGHUP', 'SIGTERM']) {
		process.once(shutdownSignal, async () => {
			logger.info('Shutting down');
			await client.shutDown();
			process.exit(0);
		});
	}

	for (const errorEvent of ['uncaughtException', 'unhandledRejection']) {
		process.once(errorEvent, async (err: unknown) => {
			Sentry.captureException(err);
			logger.prettyError(<Error>err);
			await client.shutDown();
			process.exit(1);
		});
	}

	if (process.argv.includes('run')) {
		const { runCli } = await import('@cli');

		let exitCode = 0;
		try {
			exitCode = await runCli();
		} catch (err: unknown) {
			logger.fatal('Error executing CLI command', { err });
			exitCode = 1;
		} finally {
			process.exit(exitCode);
		}
	}

	try {
		await client.boot();

		await startWebServer();

		logger.info('Successfully logged in', startupSw.toString());
	} catch (err: unknown) {
		logger.fatal('Failed to log in', { err });

		await client.shutDown();
		process.exit(1);
	} finally {
		logger.info('Finished startup', String(startupSw.stop()));
	}
}

boot();
