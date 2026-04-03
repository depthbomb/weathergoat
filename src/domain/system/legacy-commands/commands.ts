import { Routes } from 'discord.js';
import { isValidSnowflake } from '@lib/snowflake';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { Nullable } from '@depthbomb/common/typing';
import { $msg } from '@lib/messages';

type Scope  = 'global' | 'guild';
type Action = 'create' | 'delete';

const enum Subcommands {
	Create       = 'create',
	CreateGlobal = 'create-global',
	Delete       = 'delete',
	DeleteGlobal = 'delete-global',
}

export default class CommandsCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			syntax: `commands <${Subcommands.Create} [guild-ids:string...] | ${Subcommands.CreateGlobal} | ${Subcommands.Delete} [guild-ids:string...] | ${Subcommands.DeleteGlobal}>`,
			description: 'Command management commands.'
		});
	}

	public async [Subcommands.Create](message: Message) {
		return this.applyCommands(message, { scope: 'guild', action: 'create' });
	}

	public async [Subcommands.CreateGlobal](message: Message) {
		return this.applyCommands(message, { scope: 'global', action: 'create' });
	}

	public async [Subcommands.Delete](message: Message) {
		return this.applyCommands(message, { scope: 'guild', action: 'delete' });
	}

	public async [Subcommands.DeleteGlobal](message: Message) {
		return this.applyCommands(message, { scope: 'global', action: 'delete' });
	}

	private getBody(bot: WeatherGoat<true>) {
		return [...bot.commands].map(([,command]) => command.data.toJSON());
	}

	private async applyCommands(message: Message, { scope, action }: { scope: Scope; action: Action; }) {
		const botId = message.client.user.id;
		const body  = action === 'create' ? this.getBody(message.client) : [];

		if (scope === 'global') {
			await message.client.rest.put(Routes.applicationCommands(botId), { body });
			await message.reply($msg.legacyCommands.commands.finishedGlobalAction(action === 'create' ? 'registering' : 'deleting'));
			return;
		}

		const guildIds = await this.getValidGuildIds(message);
		if (!guildIds) {
			return;
		}

		for (const guildId of guildIds) {
			await message.client.rest.put(Routes.applicationGuildCommands(botId, guildId), { body });

			this.logger.withMetadata({ guildId }).info(`${action === 'create' ? 'Registered' : 'Deleted'} commands in guild`);
		}

		await message.reply($msg.legacyCommands.commands.finishedGuildAction(guildIds.length, action === 'create' ? 'registering' : 'deleting'));
	}

	private async getValidGuildIds(message: Message): Promise<Nullable<string[]>> {
		const guilds = this.ctx!.params.getString('guild-ids', true);
		const valid  = guilds.split(' ').filter(isValidSnowflake);

		if (valid.length === 0) {
			await message.reply('No valid guild IDs provided.');
			return null;
		}

		return valid;
	}
}
