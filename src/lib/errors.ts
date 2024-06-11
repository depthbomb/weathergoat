import { logger } from '@lib/logger';
import { MakeErrorClass } from 'fejl';
import { captureException } from '@sentry/bun';
import { DiscordjsError, DiscordAPIError } from 'discord.js';

export type WeatherGoatError = InvalidPermissionsError | HTTPRequestError;

export class InvalidPermissionsError extends MakeErrorClass('You do not have permission to perform this action') {}
export class HTTPRequestError extends MakeErrorClass<{ code: number; status: string; }>('An error occured while making an HTTP request') {}

export function isWeatherGoatError<T extends WeatherGoatError>(err: unknown): err is T {
	return err instanceof InvalidPermissionsError || err instanceof HTTPRequestError;
}

export function captureError(message: string, err: unknown, context?: object) {
	const { message: errorMessage, stack } = err as Error;

	logger.error(message, { ...context, errorMessage, stack });
	captureException(err);
}

export function isDiscordAPIError(err: unknown): err is DiscordAPIError {
	return err instanceof DiscordAPIError;
}

export function isDiscordJSError(err: unknown): err is DiscordjsError {
	return err instanceof DiscordjsError;
}

export function isDiscordAPIErrorCode(err: unknown, code: number): boolean;
export function isDiscordAPIErrorCode(err: unknown, codes: number[]): boolean;
export function isDiscordAPIErrorCode(err: unknown, oneOrMoreCodes: number | number[]): boolean {
	if (isDiscordAPIError(err)) {
		let { code: errorCode } = err;
		if (typeof oneOrMoreCodes === 'number') {
			return errorCode === oneOrMoreCodes;
		} else {
			if (typeof errorCode === 'string') {
				errorCode = parseInt(errorCode);
			}

			return oneOrMoreCodes.includes(errorCode);
		}
	}

	return false;
}
