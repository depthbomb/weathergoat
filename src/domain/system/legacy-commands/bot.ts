import { $msg } from '@lib/messages';
import { AttachmentBuilder } from 'discord.js';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	ListGuilds = 'list-guilds',
	LeaveGuild = 'leave-guild',
}

export default class BotCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			syntax: `bot <${Subcommands.ListGuilds} | ${Subcommands.LeaveGuild} <guild-id:string>>`,
			description: 'Owner bot management commands.'
		});
	}

	public async [Subcommands.ListGuilds](message: Message) {
		const guilds     = await message.client.guilds.fetch();
		const json       = JSON.stringify(guilds.map(g => ({ id: g.id, name: g.name })), null, 4);
		const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: 'guilds.json' });

		await message.reply({ files: [attachment] });
	}

	public async [Subcommands.LeaveGuild](message: Message) {
		const guildId = this.ctx!.params.getString('guild-id', true);
		try {
			const guild = await message.client.guilds.fetch(guildId);
			await guild.leave();
			await message.reply($msg.legacyCommands.bot.leaveGuild.success(guild.name));
		} catch {
			await message.reply($msg.legacyCommands.bot.leaveGuild.error());
		}
	}
}
