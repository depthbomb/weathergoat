import 'temporal-polyfill/global';

/** Convert Date values from weather APIs and duration helpers at the DB boundary. */
export function toInstant<T extends Date | Temporal.Instant | null | undefined>(
	value: T,
): T extends Date ? Temporal.Instant : T {
	return (
		value instanceof Date ? Temporal.Instant.fromEpochMilliseconds(value.getTime()) : value
	) as T extends Date ? Temporal.Instant : T;
}

export function requireRecord<T>(record: T | null): T {
	if (record === null) throw new Error('Database record not found');
	return record;
}

export function isUniqueViolation(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'sqlState' in error && error.sqlState === '23505';
}
