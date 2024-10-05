import { Snowflake } from '@sapphire/snowflake';
import type { Snowflake as SnowflakeType } from 'discord.js';

export const epoch = new Date('August 5, 2022 19:13:00 GMT-0500');
export const snowflake = new Snowflake(epoch);
export const generateSnowflake = () => snowflake.generate();
export function isValidSnowflake(input: SnowflakeType): boolean {
	// TODO see if this actually throws on an invalid snowflake
	try {
		snowflake.deconstruct(input);
		return true;
	} catch {
		return false;
	}
}
