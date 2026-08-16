import { parseDuration } from '@depthbomb/common/timing';

const EXPIRATION_DURATIONS = {
	'24h': parseDuration('24h'),
	'3d':  parseDuration('3d'),
	'1w':  parseDuration('1w'),
	'1mo': parseDuration('1mo')
} as const;

export type AlertDestinationExpiration = keyof typeof EXPIRATION_DURATIONS;

export function resolveDestinationExpiration(value: string | null, now = new Date()): Date | null {
	if (value === null) {
		return null;
	}

	const duration = EXPIRATION_DURATIONS[value as AlertDestinationExpiration];
	if (duration === undefined) {
		throw new RangeError(`Unsupported alert destination expiration: ${value}`);
	}

	return duration.from(now);
}
