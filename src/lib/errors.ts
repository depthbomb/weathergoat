import { MakeErrorClass } from 'fejl';
import { DiscordjsError, DiscordAPIError, DiscordjsErrorCodes } from 'discord.js';

export type WeatherGoatError = InvalidPermissionsError | HTTPRequestError | MaxDestinationError | GuildOnlyInvocationInNonGuildError;

export class InvalidPermissionsError extends MakeErrorClass() {}
export class GuildOnlyInvocationInNonGuildError extends MakeErrorClass() {}
export class HTTPRequestError extends MakeErrorClass<{ code: number; status: string; }>() {}
export class MaxDestinationError extends MakeErrorClass<{ max: number; }>() {}

/**
 * Returns `true` if the {@link error} is a WeatherGoat-specific error and `false` otherwise.
 *
 * @param err The {@link Error} to check
 */
export function isWeatherGoatError<T extends WeatherGoatError>(err: unknown): err is T {
	return err instanceof InvalidPermissionsError ||
           err instanceof GuildOnlyInvocationInNonGuildError ||
           err instanceof HTTPRequestError ||
           err instanceof MaxDestinationError;
}

/**
 * Returns `true` if the {@link error} is a {@link DiscordAPIError} and `false` otherwise.
 *
 * @param err The {@link Error} to check
 */
export function isDiscordAPIError(err: unknown): err is DiscordAPIError {
	return err instanceof DiscordAPIError;
}

/**
 * Returns `true` if the {@link error} is a {@link DiscordjsError} and `false` otherwise.
 *
 * @param err The {@link Error} to check
 */
export function isDiscordJSError(err: unknown): err is DiscordjsError;
/**
 * Returns `true` if the {@link error} is a {@link DiscordjsError} and has the same {@link code},
 * `false` otherwise.
 *
 * @param err The {@link Error} to check
 * @param code The {@link DiscordjsErrorCodes|error codes} to additionally check for
 */
export function isDiscordJSError(err: unknown, code: DiscordjsErrorCodes): err is DiscordjsError;
export function isDiscordJSError(err: unknown, code?: DiscordjsErrorCodes): err is DiscordjsError {
	const isDiscordjsError = err instanceof DiscordjsError;
	if (code) {
		return isDiscordjsError && err.code === code;
	}

	return isDiscordjsError;
}

/**
 * Returns `true` if the {@link error} is a {@link DiscordjsError} and has the same {@link code},
 * `false` otherwise.
 *
 * @param err The {@link Error} to check
 * @param code The API error code to check for
 */
export function isDiscordAPIErrorCode(err: unknown, code: number): boolean;
/**
 * Returns `true` if the {@link error} is a {@link DiscordjsError} and has at least one of the
 * provided {@link codes}, `false` otherwise.
 *
 * @param err The {@link Error} to check
 * @param codes The array of API error codes to check for
 */
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
