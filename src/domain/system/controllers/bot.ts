import { injectable } from '@needle-di/core';
import { OwnerPrecondition } from '@preconditions/owner';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { subcommand, BaseInteractionController } from '@infra/controllers';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class BotController extends BaseInteractionController {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('bot')
			.setDescription('Owner-only bot-related commands')
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.addSubcommand(sc => sc
				.setName('list-guilds')
				.setDescription('Lists all guilds that I\'m in.')
			)
			.addSubcommand(sc => sc
				.setName('leave-guild')
				.setDescription('Makes me leave a guild.')
				.addStringOption(o => o
					.setName('guild-id')
					.setDescription('The ID of the guild to leave')
					.setRequired(true)
				)
			),
			preconditions: [
				new OwnerPrecondition()
			]
		});
	}

	@subcommand('list-guilds')
	public async handleListGuildsSubcommand(interaction: ChatInputCommandInteraction) {
		const guilds = await interaction.client.guilds.fetch();
	}

	@subcommand('leave-guild')
	public async handleLeaveGuildSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.options.getString('guild-id', true);
		const guild   = await interaction.client.guilds.fetch(guildId);
	}
}
