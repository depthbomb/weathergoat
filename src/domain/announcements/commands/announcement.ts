import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { injectable } from '@needle-di/core';
import { BaseCommand } from '@infra/commands';
import { generateSnowflake } from '@lib/snowflake';
import { OwnerPrecondition } from '@preconditions/owner';
import { GuildOnlyInvocationInNonGuildError } from '@errors';
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AnnouncementCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('announcement')
			.setDescription('Commands related to developer announcements')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addSubcommand(sc => sc
				.setName('subscribe')
				.setDescription('Subscribe to announcements and post them to a channel (limit one per guild)')
				.addChannelOption(o => o
					.setName('channel')
					.setDescription('The channel to post announcements to')
					.addChannelTypes(ChannelType.GuildText)
					.setRequired(true)
				)
			)
			.addSubcommand(sc => sc
				.setName('unsubscribe')
				.setDescription('Removes an announcement subscription for this guild')
			)
			.addSubcommand(sc => sc
				.setName('create')
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
				.setName('count-subscriptions')
				.setDescription('Returns the total amount of announcement subscriptions. Owner only.')
			)
		});

		this.createSubcommandMap<'subscribe' | 'unsubscribe' | 'create' | 'count-subscriptions'>({
			subscribe: {
				handler: this._handleSubscribeSubcommand,
			},
			unsubscribe: {
				handler: this._handleUnsubscribeSubcommand,
			},
			create: {
				handler: this._handleCreateSubcommand,
				preconditions: [
					new OwnerPrecondition()
				]
			},
			'count-subscriptions': {
				handler: this._handleCountSubcommand,
				preconditions: [
					new OwnerPrecondition()
				]
			},
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleSubscribeSubcommand(interaction: ChatInputCommandInteraction) {
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

	private async _handleUnsubscribeSubcommand(interaction: ChatInputCommandInteraction) {
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

	private async _handleCreateSubcommand(interaction: ChatInputCommandInteraction) {
		const title      = interaction.options.getString('title', true).trim();
		const body       = interaction.options.getString('body', true).trim();
		const colorInput = interaction.options.getString('color')?.trim();

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

	private async _handleCountSubcommand(interaction: ChatInputCommandInteraction) {
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
