import { logger } from '@lib/logger';
import { MakeErrorClass } from 'fejl';
import { captureException } from '@sentry/node';

export type WeatherGoatError = InvalidPermissionsError;

export class InvalidPermissionsError extends MakeErrorClass('You do not have permission to perform this action') {}

export function isWeatherGoatError(err: unknown): err is WeatherGoatError {
	return err instanceof InvalidPermissionsError;
}

export function captureError(message: string, err: unknown, context?: object) {
	logger.error(message, { ...context, err });
	captureException(err);
}
