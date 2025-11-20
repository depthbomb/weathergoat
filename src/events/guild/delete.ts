import { db } from '@db';
import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import type { LogLayer } from 'loglayer';
import type { Guild } from 'discord.js';

export default class GuildDeleteEvent extends BaseEvent<'guildDelete'> {
	private readonly logger: LogLayer;

	public constructor() {
		super({ name: 'guildDelete' });

		this.logger = logger.child().withPrefix(`[Event::${this.name}]`);
	}

	public async handle(guild: Guild) {
		// Clean up database records that we no longer need if we are no longer operating inside of
		// the related guild.

		const guildId = guild.id;
		const where   = { guildId };

		this.logger.withMetadata({
			name: guild.name,
			guildId
		}).info('No longer operating in a guild, cleaning up database');

		await db.alertDestination.deleteMany({ where });
		await db.forecastDestination.deleteMany({ where });
		await db.autoRadarMessage.deleteMany({ where });
		await db.volatileMessage.deleteMany({ where });
	}
}
