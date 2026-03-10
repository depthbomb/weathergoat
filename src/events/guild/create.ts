import { BaseEvent } from '@events';
import type { Guild } from 'discord.js';

export default class GuildCreateEvent extends BaseEvent<'guildCreate'> {
	public constructor() {
		super({ name: 'guildCreate' });
	}

	public async handle(guild: Guild) {
		this.logger.withMetadata({ id: guild.id, name: guild.name }).info('Added to guild');

		// const channel = guild.systemChannel ?? guild.channels.cache
		// 	.filter(c => c.isTextBased() && !c.isThread())
		// 	.sort((a, b) => a.position - b.position)
		// 	.first();
	}
}
