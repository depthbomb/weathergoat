import { DiscordAPIError } from 'discord.js';

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
