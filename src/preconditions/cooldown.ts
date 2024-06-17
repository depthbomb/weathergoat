import { time } from 'discord.js';
import { BasePrecondition } from '@preconditions';
import { Duration } from '@sapphire/time-utilities';
import { PreconditionResult } from '@preconditions';
import { RateLimitManager } from '@sapphire/ratelimits';
import { isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

type CooldownPreconditionOptions = {
	duration: string;
	limit?: number;
	global?: boolean;
};

export default class CooldownPrecondition extends BasePrecondition {
	private readonly _global: boolean;
	private readonly _manager: RateLimitManager<string>;

	/**
	 * Creates a precondition that adds a cooldown to interactions.
	 * @param duration The delay that subject must wait after executing the interaction before it can be
	 * executed again.
	 * @param limit The number of times the interaction can be executed per the {@link duration} before
	 * the subject is limited.
	 * @param global Whether the limit applies to everyone in the guild.
	 */
	public constructor({ duration, limit, global }: CooldownPreconditionOptions) {
		super();

		this._global = global ?? false;
		this._manager = new RateLimitManager<string>(new Duration(duration).offset, limit);
	}

	public async check(interaction: ChatInputCommandInteraction<CacheType>): Promise<PreconditionResult> {
		let id = interaction.user.id;
		if (this._global) {
			const { channel } = interaction;
			if (channel) {
				// Default to the user ID if the command is not called in a guild
				id = isGuildBasedChannel(channel) ? channel.guildId : interaction.user.id;
			}
		}

		const ratelimit = this._manager.acquire(id);
		if (ratelimit.limited) {
			const expiresAt = new Date(ratelimit.expires);

			return PreconditionResult.fromFailure(`You are under a cooldown that expires ${time(expiresAt, 'R')}.`);
		}

		ratelimit.consume();

		return PreconditionResult.fromSuccess();
	}
}
