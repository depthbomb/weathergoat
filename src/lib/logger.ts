import 'winston-daily-rotate-file';
import { join } from 'node:path';
import { LOGS_DIR } from '@constants';
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
	format.printf(({ level, message, timestamp, ...meta }) => `${timestamp} [${level}] ${message} ${JSON.stringify(meta)}`)
);
const consoleTransport = new transports.Console({ level: process.env.DEV ? 'silly' : 'http', format: consoleTransportFormat });

const fileTransportFormat = format.combine(
	format.timestamp(),
	format.printf(({ level, message, timestamp, ...meta }) => `${timestamp} [${level}] ${message} ${JSON.stringify(meta)}`)
)

export const logger = createLogger({
	transports: [
		consoleTransport,
		new transports.DailyRotateFile({
			level: 'error',
			filename: join(LOGS_DIR, 'error.%DATE%.log'),
			datePattern: 'YYYYMMDD',
			maxFiles: '7d',
			zippedArchive: true,
			format: fileTransportFormat
		}),
		new transports.DailyRotateFile({
			level: 'silly',
			filename: join(LOGS_DIR, 'combined.%DATE%.log'),
			datePattern: 'YYYYMMDD',
			maxFiles: '7d',
			zippedArchive: true,
			format: fileTransportFormat
		}),
	]
});
