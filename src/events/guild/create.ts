import { BaseEvent } from '@events';
import { $msg } from '@lib/messages';
import type { Guild } from 'discord.js';

export default class GuildCreateEvent extends BaseEvent<'guildCreate'> {

	public constructor() {
		super({ name: 'guildCreate' });
	}

	public async handle(guild: Guild) {
		const l = this.logger.withMetadata({ id: guild.id, name: guild.name });

		l.info('Added to guild');

		try {
			const channel = guild.systemChannel ?? guild.channels.cache
				.filter(c => c.isTextBased() && !c.isThread())
				.sort((a, b) => a.position - b.position)
				.first();
			if (!channel || !channel.isSendable()) {
				return;
			}

			await channel.send($msg.events.guildCreate.introMessage());

			l.info(`Successfully sent introduction to channel "${channel.name}" (${channel.id})`);
		} catch (err) {
			l.withError(err).error('Failed to send introduction');
		}
	}
}
