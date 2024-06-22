import { MakeErrorClass } from 'fejl';
import { DiscordjsError, DiscordAPIError, DiscordjsErrorCodes } from 'discord.js';

export type WeatherGoatError = InvalidPermissionsError | HTTPRequestError | MaxDestinationError;

export class InvalidPermissionsError extends MakeErrorClass('You do not have permission to perform this action') {}
export class HTTPRequestError extends MakeErrorClass<{ code: number; status: string; }>('An error occurred while making an HTTP request') {}
export class MaxDestinationError extends MakeErrorClass<{ max: number; }>('You have reached the maximum amount of destinations.') {}

export function isWeatherGoatError<T extends WeatherGoatError>(err: unknown): err is T {
	return err instanceof InvalidPermissionsError || err instanceof HTTPRequestError || err instanceof MaxDestinationError;
}

export function isDiscordAPIError(err: unknown): err is DiscordAPIError {
	return err instanceof DiscordAPIError;
}

export function isDiscordJSError(err: unknown): err is DiscordjsError;
export function isDiscordJSError(err: unknown, code: DiscordjsErrorCodes): err is DiscordjsError;
export function isDiscordJSError(err: unknown, code?: DiscordjsErrorCodes): err is DiscordjsError {
	const isDiscordjsError = err instanceof DiscordjsError;
	if (code) {
		return isDiscordjsError && err.code === code;
	}

	return isDiscordjsError;
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
