import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { generateSnowflake } from '@lib/snowflake';
import { OwnerPrecondition } from '@preconditions/owner';
import { GuildOnlyInvocationInNonGuildError } from '@errors';
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Subscribe          = 'subscribe',
	Unsubscribe        = 'unsubscribe',
	Create             = 'create',
	CountSubscriptions = 'count-subscriptions',
}

export default class AnnouncementCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('announcement')
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
				.addSubcommand(sc => sc
					.setName(Subcommands.Create)
					.setDescription('Creates an announcement to be dispatched to subscribed guilds. Owner only.')
					.addStringOption(o => o
						.setName('title')
						.setDescription('The title of the announcement')
						.setRequired(true)
					)
					.addStringOption(o => o
						.setName('body')
						.setDescription('The content of the announcement')
						.setRequired(true)
					)
				)
				.addSubcommand(sc => sc
					.setName(Subcommands.CountSubscriptions)
					.setDescription('Returns the total amount of announcement subscriptions. Owner only.')
				)
		});

		this.createSubcommandMap<Subcommands>({
			[Subcommands.Subscribe]: [],
			[Subcommands.Unsubscribe]: [],
			[Subcommands.Create]: [new OwnerPrecondition()],
			[Subcommands.CountSubscriptions]: [new OwnerPrecondition()],
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

	public async [Subcommands.Create](interaction: ChatInputCommandInteraction) {
		const title = interaction.options.getString('title', true).trim();
		const body  = interaction.options.getString('body', true).trim();

		if (!title.length || !body.length) {
			await interaction.reply({ content: $msg.commands.announcements.create.emptyTitleOrBody(), flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const snowflake = generateSnowflake();

		try {
			const announcement = await db.announcement.create({
				data: {
					snowflake,
					title,
					body
				}
			});

			const subscriptions = await db.announcementSubscription.findMany();
			const deliveries    = subscriptions.map(s => ({ announcementId: announcement.id, subscriptionId: s.id }));

			await db.announcementDelivery.createMany({ data: deliveries });
			await interaction.editReply($msg.commands.announcements.create.success());
		} catch (err) {
			reportError('Unable to create announcement record', err, { snowflake });
			await interaction.editReply(
				$msg.commands.announcements.create.error(
					(err as Error).name,
					(err as Error).stack,
				)
			);
		}
	}

	public async [Subcommands.CountSubscriptions](interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		try {
			const count = await db.announcementSubscription.count();
			await interaction.editReply($msg.commands.announcements.count.success(count));
		} catch (err) {
			reportError('Unable to count announcement records', err);
			await interaction.editReply(
				$msg.commands.announcements.count.error(
					(err as Error).name,
					(err as Error).stack,
				)
			);
		}
	}
}
