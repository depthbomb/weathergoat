import { Snowflake } from '@sapphire/snowflake';

export const snowflake = new Snowflake(
	new Date('2022-08-16T00:00:00-0600')
);

export function generateSnowflake() {
	return snowflake.generate().toString();
}

export function isSnowflakeValid(input: string): boolean {
	try {
		snowflake.deconstruct(input);
		return true;
	} catch {
		return false;
	}
}
