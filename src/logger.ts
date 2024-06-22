import 'winston-daily-rotate-file';
import { join } from 'node:path';
import { LOGS_DIR } from '@constants';
import { captureException } from '@sentry/bun';
import { format, transports, createLogger } from 'winston';

// error   0
// warn    1
// info    2
// http    3 ← a transport's level set to 3, for example, would log messages of this level upward ↑
// verbose 4
// debug   5
// silly   6

const consoleTransportFormat = format.combine(
	format.colorize(),
	format.timestamp(),
	format.padLevels(),
	format.printf(({ level, message, timestamp, ...meta }) => {
		if (Object.keys(meta).length) return `${timestamp} [${level}] ${message} ${JSON.stringify(meta)}`;

		return `${timestamp} [${level}] ${message}`;
	})
);

const consoleTransport = new transports.Console({
	level: process.env.MODE === 'development' ? 'silly' : 'info',
	format: consoleTransportFormat
});

const fileTransportFormat = format.combine(
	format.timestamp(),
	format.printf((obj) => JSON.stringify(obj))
);

export const logger = createLogger({
	transports: [
		consoleTransport,
		new transports.DailyRotateFile({
			level: 'error',
			filename: join(LOGS_DIR, 'error.%DATE%.log'),
			datePattern: 'YYYYMMDD',
			maxFiles: '5d',
			zippedArchive: true,
			format: fileTransportFormat
		}),
		new transports.DailyRotateFile({
			level: 'info',
			filename: join(LOGS_DIR, 'info.%DATE%.log'),
			datePattern: 'YYYYMMDD',
			maxFiles: '5d',
			zippedArchive: true,
			format: fileTransportFormat
		}),
		new transports.DailyRotateFile({
			level: 'silly',
			filename: join(LOGS_DIR, 'combined.%DATE%.log'),
			datePattern: 'YYYYMMDD',
			maxFiles: '5d',
			zippedArchive: true,
			format: fileTransportFormat
		}),
	]
});

export function reportError(message: string, err: unknown, ...args: unknown[]) {
	logger.error(message, err, ...args);
	captureException(err);
}
