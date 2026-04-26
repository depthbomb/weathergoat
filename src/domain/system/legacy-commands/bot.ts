import { $msg } from '@lib/messages';
import { AttachmentBuilder } from 'discord.js';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	ListGuilds = 'list-guilds',
	LeaveGuild = 'leave-guild',
}

export class BotCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'bot',
			description: 'Owner bot management commands.',
			subcommands: {
				[Subcommands.ListGuilds]: [],
				[Subcommands.LeaveGuild]: [
					LegacyCommandParam.string('guild-id'),
				],
			},
		});
	}

	public async [Subcommands.ListGuilds](message: Message) {
		const guilds     = await message.client.guilds.fetch();
		const json       = JSON.stringify(guilds.map(g => ({ id: g.id, name: g.name })), null, 4);
		const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: 'guilds.json' });

		await message.reply({ files: [attachment] });
	}

	public async [Subcommands.LeaveGuild](message: Message) {
		const guildId = this.ctx.params.getString('guild-id', true);
		try {
			const guild = await message.client.guilds.fetch(guildId);
			await guild.leave();
			await message.reply($msg.system.legacy.bot.leaveGuild.success(guild.name));
		} catch {
			await message.reply($msg.system.legacy.bot.leaveGuild.error());
		}
	}
}
