import { time } from 'discord.js';
import { Duration } from '@sapphire/time-utilities';
import { PreconditionResult } from '@preconditions';
import { RateLimitManager } from '@sapphire/ratelimits';
import { isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type { Precondition } from '@preconditions';

type CooldownPreconditionOptions = {
	duration: string;
	limit?: number;
	global?: boolean;
};

/**
 * Creates a precondition that adds a cooldown to interactions.
 * @param duration The delay that subject must wait after executing the interaction before it can be
 * executed again.
 * @param limit The number of times the interaction can be executed per the {@link duration} before
 * the subject is limited.
 * @param global Whether the limit applies to everyone in the guild.
 */
export function cooldownPrecondition({ duration, limit, global }: CooldownPreconditionOptions): Precondition {
	const manager = new RateLimitManager<string>(new Duration(duration).offset, limit);

	return (interaction) => {
		let id = interaction.user.id;
		if (global) {
			const { channel } = interaction;
			if (channel) {
				// Default to the user ID if the command is not called in a guild
				id = isGuildBasedChannel(channel) ? channel.guildId : interaction.user.id;
			}
		}

		const ratelimit = manager.acquire(id);
		if (ratelimit.limited) {
			const expiresAt = new Date(ratelimit.expires);

			return PreconditionResult.fromFailure(`You are under a cooldown that expires ${time(expiresAt, 'R')}.`);
		}

		ratelimit.consume();

		return PreconditionResult.fromSuccess();
	};
}
