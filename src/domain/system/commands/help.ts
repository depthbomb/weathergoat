import { $msg } from '@lib/messages';
import { BaseCommand } from '@infra/commands';
import { createMessageComponent } from '@utils/components';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export class HelpCommand extends BaseCommand {
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

		await interaction.reply({
			components: [createMessageComponent($msg.system.helpText(alerts, forecasts, autoRadar, radar, announcement))],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
