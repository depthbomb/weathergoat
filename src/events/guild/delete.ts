import { db } from '@db';
import { BaseEvent } from '@events';
import type { Guild } from 'discord.js';

export default class GuildDeleteEvent extends BaseEvent<'guildDelete'> {
	public constructor() {
		super({ name: 'guildDelete' });
	}

	public async handle(guild: Guild) {
		// Clean up database records that we no longer need if we are no longer operating inside of
		// the related guild.

		const where  = { guildId: guild.id };

		this.logger.withMetadata({ id: guild.id, name: guild.name }).info('No longer operating in a guild, cleaning up database');

		await db.alertDestination.deleteMany({ where });
		await db.forecastDestination.deleteMany({ where });
		await db.autoRadarMessage.deleteMany({ where });
		await db.volatileMessage.deleteMany({ where });
	}
}
