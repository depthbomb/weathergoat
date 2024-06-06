import { logger } from '@lib/logger';
import { MakeErrorClass } from 'fejl';
import { DiscordAPIError } from 'discord.js';
import { captureException } from '@sentry/bun';

export type WeatherGoatError = InvalidPermissionsError;

export class InvalidPermissionsError extends MakeErrorClass('You do not have permission to perform this action') {}

export function isWeatherGoatError(err: unknown): err is WeatherGoatError {
	return err instanceof InvalidPermissionsError;
}

export function captureError(message: string, err: unknown, context?: object) {
	const { message: errorMessage, stack } = err as Error;

	logger.error(message, { ...context, errorMessage, stack });
	captureException(err);
}

export function isDiscordAPIError(err: unknown): err is DiscordAPIError {
	return err instanceof DiscordAPIError;
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
