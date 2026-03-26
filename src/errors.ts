import { MakeErrorClass } from 'fejl';
import { DiscordjsError, DiscordAPIError, DiscordjsErrorCodes } from 'discord.js';
import type { Awaitable } from '@depthbomb/common';

export class InvalidPermissionsError extends MakeErrorClass() {}
export class GuildOnlyInvocationInNonGuildError extends MakeErrorClass() {}
export class InvalidSnowflakeError extends MakeErrorClass() {}
export class HTTPRequestError extends MakeErrorClass<{ code: number; status: string; }>() {}
export class MaxDestinationError extends MakeErrorClass<{ max: number; }>() {}

const WEATHER_GOAT_ERRORS = Object.freeze([
	InvalidPermissionsError,
	GuildOnlyInvocationInNonGuildError,
	InvalidSnowflakeError,
	HTTPRequestError,
	MaxDestinationError
] as const);

export type WeatherGoatError            = InstanceType<typeof WEATHER_GOAT_ERRORS[number]>;
export type WeatherGoatErrorConstructor = (typeof WEATHER_GOAT_ERRORS)[number];

/**
 * Attempts to match an unknown error against a list of constructor-handler pairs, invoking the
 * handler for the first matching error type.
 *
 * Each matcher is a tuple where:
 * - The first element is an error constructor (class/function)
 * - The second element is a handler that will be invoked if {@link err} is an instance of that
 * constructor
 *
 * @typeParam Awaitable - A value that may be either synchronous or a {@link Promise}
 *
 * @param err - The unknown error value to match against
 * @param matchers - An array of tuples containing an error constructor and its corresponding
 * handler
 *
 * @returns A promise that resolves once the matching handler (if any) has completed.
 * If no match is found, the promise resolves immediately.
 *
 * @remarks
 * - Handlers may be synchronous or asynchronous.
 * - Only the first matching handler is executed.
 * - If a handler throws or rejects, the returned promise will reject.
 * - If no match is found, no handler is executed.
 * - The constructor type is loosely typed as {@link Function}, so type safety is not enforced.
 *   For stricter typing, consider using a generic constructor signature.
 */
export async function matchError(err: unknown, matchers: Array<[Function, () => Awaitable<void>]>): Promise<void> {
	for (const [Type, handler] of matchers) {
		if (err instanceof (Type as any)) {
			await handler();
			return;
		}
	}
}

/**
 * Checks whether an unknown value is a WeatherGoat-specific error.
 *
 * @typeParam T - (Optional) A specific WeatherGoat error constructor to check against.
 *
 * @param err - The unknown value to check.
 * @param type - (Optional) A specific WeatherGoat error constructor to match against.
 *
 * @returns `true` if {@link err} is a WeatherGoat error (or matches the specified constructor), `false` otherwise.
 *
 * @remarks
 * - Passing a constructor allows type-safe narrowing to that specific error subtype.
 * - Without a constructor, any WeatherGoat error class will match.
 * - Uses `instanceof` for runtime checks; works with class-based errors only.
 */
export function isWeatherGoatError(err: unknown): err is WeatherGoatError;
export function isWeatherGoatError<T extends WeatherGoatErrorConstructor>(err: unknown, type: T): err is InstanceType<T>;
export function isWeatherGoatError(err: unknown, type?: WeatherGoatErrorConstructor): boolean {
	if (type) {
		return err instanceof type;
	}

	return WEATHER_GOAT_ERRORS.some(e => err instanceof e);
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
	return err instanceof DiscordjsError && (!code || err.code === code);
}

/**
 * Returns `true` if the {@link error} is a {@link DiscordAPIError} and has the same {@link code},
 * `false` otherwise.
 *
 * @param err The {@link Error} to check
 * @param code The API error code to check for
 */
export function isDiscordAPIErrorCode(err: unknown, code: number): boolean;
/**
 * Returns `true` if the {@link error} is a {@link DiscordAPIError} and has at least one of the
 * provided {@link codes}, `false` otherwise.
 *
 * @param err The {@link Error} to check
 * @param codes The array of API error codes to check for
 */
export function isDiscordAPIErrorCode(err: unknown, codes: number[]): boolean;
export function isDiscordAPIErrorCode(err: unknown, codes: number | number[]): boolean {
	if (!(err instanceof DiscordAPIError)) {
		return false;
	}

	const errorCode = typeof err.code === 'string' ? parseInt(err.code, 10) : err.code;

	return Array.isArray(codes) ? codes.includes(errorCode) : errorCode === codes;
}
