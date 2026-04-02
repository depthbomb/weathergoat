import { BaseCommand } from '@infra/commands';
import { OwnerPrecondition } from '@preconditions/owner';
import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	ListGuilds = 'list-guilds',
	LeaveGuild = 'leave-guild',
}

export default class BotCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('bot')
			.setDescription('Owner-only bot-related commands')
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.addSubcommand(sc => sc
				.setName(Subcommands.ListGuilds)
				.setDescription('Lists all guilds that I\'m in.')
			)
			.addSubcommand(sc => sc
				.setName(Subcommands.LeaveGuild)
				.setDescription('Makes me leave a guild.')
				.addStringOption(o => o
					.setName('guild-id')
					.setDescription('The ID of the guild to leave')
					.setRequired(true)
				)
			),
			preconditions: [new OwnerPrecondition()]
		});

		this.createSubcommandMap<Subcommands>({
			[Subcommands.ListGuilds]: [],
			[Subcommands.LeaveGuild]: []
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.ListGuilds](interaction: ChatInputCommandInteraction) {
		const guilds = await interaction.client.guilds.fetch();

		await interaction.deferReply();

		const json       = JSON.stringify(guilds.map(g => ({ id: g.id, name: g.name })), null, 4);
		const buf        = Buffer.from(json, 'utf8');
		const attachment = new AttachmentBuilder(buf, { name: 'guilds.json' });

		await interaction.editReply({ files: [attachment] });
	}

	public async [Subcommands.LeaveGuild](interaction: ChatInputCommandInteraction) {
		const guildId = interaction.options.getString('guild-id', true);

		await interaction.deferReply();

		try {
			const guild = await interaction.client.guilds.fetch(guildId);
			await guild?.leave();
			await interaction.editReply(`Successfully left guild **${guild.name}**.`);
		} catch (err) {
			await interaction.editReply('Could not retrieve a guild that I\'m in by the provided ID.');
		}
	}
}
