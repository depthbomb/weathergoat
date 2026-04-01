import { $msg } from '@lib/messages';
import { injectable } from '@needle-di/core';
import { SlashCommandBuilder } from 'discord.js';
import { command, BaseInteractionController } from '@infra/controllers';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class HelpController extends BaseInteractionController {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('help')
			.setDescription('Get an overview of my commands')
		});
	}

	@command()
	private async showHelpCommand(interaction: ChatInputCommandInteraction) {
		const client = interaction.client;
		const [alerts, forecasts, autoRadar, radar, announcement] = await Promise.all([
			client.getCommandLink('alerts', 'add'),
			client.getCommandLink('forecasts'),
			client.getCommandLink('auto-radar'),
			client.getCommandLink('radar'),
			client.getCommandLink('announcement', 'subscribe'),
		]);
		const commandsOverview = $msg.common.messages.helpText(alerts, forecasts, autoRadar, radar, announcement);

		await interaction.reply(commandsOverview);
	}
}
