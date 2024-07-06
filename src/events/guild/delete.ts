import { db } from '@db';
import { logger } from '@logger';
import { BaseEvent } from '@events';
import type { Logger } from 'winston';
import type { Guild } from 'discord.js';

export default class GuildDeleteEvent extends BaseEvent<'guildDelete'> {
	private readonly _logger: Logger;

	public constructor() {
		super({ name: 'guildDelete' });

		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(guild: Guild) {
		// Clean up database records that we no longer need if we are no longer operating inside
		// of the related guild.

		const guildId = guild.id;
		const where = { guildId };

		this._logger.info('No longer operating in a guild, cleaning up database', {
			name: guild.name,
			guildId
		});

		await db.alertDestination.deleteMany({ where });
		await db.forecastDestination.deleteMany({ where });
		await db.autoRadarMessage.deleteMany({ where });
		await db.volatileMessage.deleteMany({ where });
	}
}
