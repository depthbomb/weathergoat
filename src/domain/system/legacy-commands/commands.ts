import { Routes } from 'discord.js';
import { $msg } from '@lib/messages';
import { isValidSnowflake } from '@lib/snowflake';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { Nullable } from '@depthbomb/common/typing';

type Scope  = 'global' | 'guild';
type Action = 'create' | 'delete';

const enum Subcommands {
	Create       = 'create',
	CreateGlobal = 'create-global',
	Delete       = 'delete',
	DeleteGlobal = 'delete-global',
}

export class CommandsCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'commands',
			description: 'Command management commands.',
			subcommands: {
				[Subcommands.Create]: [
					LegacyCommandParam.string('guild-ids', { required: false, rest: true }),
				],
				[Subcommands.CreateGlobal]: [],
				[Subcommands.Delete]: [
					LegacyCommandParam.string('guild-ids', { required: false, rest: true }),
				],
				[Subcommands.DeleteGlobal]: [],
			},
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
			await message.reply($msg.system.legacy.commands.finishedGlobalAction(action === 'create' ? 'registering' : 'deleting'));
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

		await message.reply($msg.system.legacy.commands.finishedGuildAction(guildIds.length, action === 'create' ? 'registering' : 'deleting'));
	}

	private async getValidGuildIds(message: Message): Promise<Nullable<string[]>> {
		const guilds = this.ctx.params.getString('guild-ids', true);
		const valid  = guilds.split(' ').filter(isValidSnowflake);

		if (valid.length === 0) {
			await message.reply($msg.system.legacy.commands.noValidGuildIds());
			return null;
		}

		return valid;
	}
}
