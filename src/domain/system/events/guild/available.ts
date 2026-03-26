import { BaseEvent } from '@infra/events';
import type { Guild } from 'discord.js';

export default class GuildAvailableEvent extends BaseEvent<'guildAvailable'> {
	public constructor() {
		super({ name: 'guildAvailable' });
	}

	public async handle(guild: Guild) {
		this.logger.withMetadata({ id: guild.id, name: guild.name }).info('Guild is now available');
	}
}
