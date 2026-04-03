import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { GuildOnlyInvocationInNonGuildError } from '@errors';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Subscribe   = 'subscribe',
	Unsubscribe = 'unsubscribe',
}

export default class AnnouncementCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('announcements')
				.setDescription('Commands related to developer announcements')
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand(sc => sc
					.setName(Subcommands.Subscribe)
					.setDescription('Subscribe to announcements and post them to a channel (limit one per guild)')
					.addChannelOption(o => o
						.setName('channel')
						.setDescription('The channel to post announcements to')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
					)
				)
				.addSubcommand(sc => sc
					.setName(Subcommands.Unsubscribe)
					.setDescription('Removes an announcement subscription for this guild')
				)
		});

		this.configureSubcommands<Subcommands>({
			[Subcommands.Subscribe]:   [],
			[Subcommands.Unsubscribe]: [],
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.Subscribe](interaction: ChatInputCommandInteraction) {
		const { guildId } = interaction;

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const channelId = channel.id;

		await interaction.deferReply();

		const existingSubscription = await db.announcementSubscription.findFirst({ where: { guildId } });
		if (existingSubscription) {
			await interaction.editReply($msg.commands.announcements.subscribe.alreadySubscribed());
			return;
		}

		try {
			await db.announcementSubscription.create({ data: { guildId, channelId } });
			await interaction.editReply($msg.commands.announcements.subscribe.success(channelId.toChannelLink()));
		} catch (err) {
			reportError('Unable to create announcement subscription record', err, { guildId, channelId });
			await interaction.editReply($msg.commands.announcements.subscribe.error());
		}
	}

	public async [Subcommands.Unsubscribe](interaction: ChatInputCommandInteraction) {
		const { guildId } = interaction;

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		await interaction.deferReply();

		const existingSubscription = await db.announcementSubscription.findFirst({ where: { guildId } });
		if (!existingSubscription) {
			await interaction.editReply($msg.commands.announcements.unsubscribe.notSubscribed());
			return;
		}

		try {
			await db.announcementSubscription.delete({ where: { guildId } });
			await interaction.editReply($msg.commands.announcements.unsubscribe.success());
		} catch (err) {
			reportError('Unable to remove announcement subscription record', err, { guildId });
			await interaction.editReply($msg.commands.announcements.unsubscribe.error());
		}
	}
}
