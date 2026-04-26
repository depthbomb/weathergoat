import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Subscribe   = 'subscribe',
	Unsubscribe = 'unsubscribe',
}

export class AnnouncementCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('announcements')
				.setDescription('Commands related to developer announcements')
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand(sc => sc
					.setName(Subcommands.Subscribe)
					.setDescription('Subscribe to receiving announcements via direct message')
				)
				.addSubcommand(sc => sc
					.setName(Subcommands.Unsubscribe)
					.setDescription('Unsubscribes from receiving announcements via direct message')
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
		const userId = interaction.user.id;

		await interaction.deferReply();

		const existingSubscription = await db.announcementSubscription.findFirst({ where: { userId } });
		if (existingSubscription) {
			await interaction.editReply($msg.commands.announcements.subscribe.alreadySubscribed());
			return;
		}

		try {
			await db.announcementSubscription.create({ data: { userId } });
			await interaction.editReply($msg.commands.announcements.subscribe.success());
		} catch (err) {
			reportError('Unable to create announcement subscription record', err, { userId });
			await interaction.editReply($msg.commands.announcements.subscribe.error());
		}
	}

	public async [Subcommands.Unsubscribe](interaction: ChatInputCommandInteraction) {
		const userId = interaction.user.id;

		await interaction.deferReply();

		const existingSubscription = await db.announcementSubscription.findFirst({ where: { userId } });
		if (!existingSubscription) {
			await interaction.editReply($msg.commands.announcements.unsubscribe.notSubscribed());
			return;
		}

		try {
			await db.announcementSubscription.delete({ where: { userId } });
			await interaction.editReply($msg.commands.announcements.unsubscribe.success());
		} catch (err) {
			reportError('Unable to remove announcement subscription record', err, { userId });
			await interaction.editReply($msg.commands.announcements.unsubscribe.error());
		}
	}
}
