import { BaseEvent } from '@events';
import type { Guild } from 'discord.js';

export default class GuildCreateEvent extends BaseEvent<'guildCreate'> {
	private readonly introduction = [
		'## Thank you for adding me to your server! Here\'s a quick rundown to get started:',
		'- Use the `/alerts` commands to manage weather alert reporting',
		'- Use the `/forecasts` command to designate a channel for reporting hourly forecasts to',
		'- Use the `/auto-radar` command to designate a channel to keep an auto-updating doppler radar animation in',
		'- Use the `/radar` command to get the current doppler radar animation for a location',
		'\n',
		'Admins in this server can use the `/announcement` command to set a channel to receive announcements related to my operation. Announcements are opt-in as to reduce noise.',
		'Lastly, if you encounter any bugs, oddities, or have any suggestions then use the `/feedback` command to submit feedback!',
		'\n',
		'-# I apologize if this is not an appropriate channel for this introduction.'
	].join('\n');

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
			if (!channel) {
				return;
			}

			await channel.send(this.introduction);

			l.info(`Successfully sent introduction to channel "${channel.name}" (${channel.id})`);
		} catch (err) {
			l.withError(err).error('Failed to send introduction');
		}
	}
}
