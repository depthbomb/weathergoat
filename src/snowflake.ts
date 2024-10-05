import { Snowflake } from '@sapphire/snowflake';

type SnowflakeType = string | bigint;

export const enum SnowflakeReturnType {
	BigInt,
	String,
}

export const epoch = new Date('August 5, 2022 19:13:00 GMT-0500');

export const snowflake = new Snowflake(epoch);

export function generateSnowflake(): string;
export function generateSnowflake(returnType: SnowflakeReturnType.String): string;
export function generateSnowflake(returnType: SnowflakeReturnType.BigInt): bigint;
export function generateSnowflake(returnType: SnowflakeReturnType = SnowflakeReturnType.String): string | bigint {
	const sf = snowflake.generate();
	if (returnType === SnowflakeReturnType.String) {
		return sf.toString();
	}

	return sf;
}

export function isValidSnowflake(input: SnowflakeType): boolean {
	try {
		const parts = snowflake.deconstruct(input);
		return parts.epoch === BigInt(epoch.getTime());
	} catch {
		return false;
	}
}
