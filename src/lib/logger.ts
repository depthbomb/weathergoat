import { join } from 'node:path';
import { LogLayer } from 'loglayer';
import { LOGS_DIR } from '@constants';
import { captureException } from '@sentry/bun';
import { serializeError } from 'serialize-error';
import { sprintfPlugin } from '@loglayer/plugin-sprintf';
import { redactionPlugin } from '@loglayer/plugin-redaction';
import { LogFileRotationTransport } from '@loglayer/transport-log-file-rotation';
import { getSimplePrettyTerminal } from '@loglayer/transport-simple-pretty-terminal';

export const logger = new LogLayer({
	prefix: '[WeatherGoat]',
	errorSerializer: serializeError,
	transport: [
		getSimplePrettyTerminal({
			runtime: 'node',
			viewMode: 'inline'
		}),
		new LogFileRotationTransport({
			filename: join(LOGS_DIR, 'app-%DATE%.log'),
			dateFormat: 'YMD',
			frequency: 'daily',
			maxLogs: 5
		}),
	],
	plugins: [
		sprintfPlugin(),
		redactionPlugin({
			paths: ['token', 'botToken', 'password']
		})
	]
});

export function reportError(message: string, err: unknown, metadata?: object) {
	captureException(err);
	logger.withError(err).withMetadata(metadata).fatal(message);
}
