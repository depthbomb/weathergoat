import { BaseEvent } from '@events';
import type { Guild } from 'discord.js';

export default class GuildUnavailableEvent extends BaseEvent<'guildUnavailable'> {
	public constructor() {
		super({ name: 'guildUnavailable' });
	}

	public async handle(guild: Guild) {
		this.logger.withMetadata({ id: guild.id, name: guild.name }).info('Guild is unavailable');
	}
}
