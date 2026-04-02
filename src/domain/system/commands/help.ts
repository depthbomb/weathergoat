import { $msg } from '@lib/messages';
import { BaseCommand } from '@infra/commands';
import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class HelpCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('help')
				.setDescription('Get an overview of my commands')
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
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
