import { db } from '@db';
import { $msg } from '@lib/messages';
import { BaseCommand } from '@commands';
import { reportError } from '@lib/logger';
import { injectable } from '@needle-di/core';
import { generateSnowflake } from '@lib/snowflake';
import { OwnerPrecondition } from '@preconditions/owner';
import { GuildOnlyInvocationInNonGuildError } from '@lib/errors';
import { PermissionsPrecondition } from '@preconditions/permissions';
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AnnouncementCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('announcement')
			.setDescription('Commands related to developer announcements')
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
				.addStringOption(o => o
					.setName('color')
					.setDescription('The color to use for the embed containing the announcement')
					.setRequired(false)
				)
			)
		});

		this.createSubcommandMap<'subscribe' | 'unsubscribe' | 'create'>({
			subscribe: {
				handler: this._handleSubscribeSubcommand,
				preconditions: [
					new PermissionsPrecondition(PermissionFlagsBits.ManageGuild)
				]
			},
			unsubscribe: {
				handler: this._handleUnsubscribeSubcommand,
				preconditions: [
					new PermissionsPrecondition(PermissionFlagsBits.ManageGuild)
				]
			},
			create: {
				handler: this._handleCreateSubcommand,
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
			await interaction.reply({ content: 'Title and body cannot be empty.', flags: MessageFlags.Ephemeral });
			return;
		}

		const parsedColor = this.parseHexColor(colorInput);
		if (colorInput && parsedColor === null) {
			await interaction.reply({ content: 'Invalid color. Provide a 6-digit hex color like `#1e40af`.', flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const snowflake = generateSnowflake();
		const storedColor = parsedColor !== null ? `#${colorInput!.replace(/^#|^0x/i, '').toUpperCase()}` : null;

		try {
			await db.announcement.create({
				data: {
					snowflake,
					title,
					body,
					color: storedColor
				}
			});
		} catch (err) {
			reportError('Unable to create announcement record', err, { snowflake });
			await interaction.editReply('Unable to create announcement. Please try again later.');
		}
	}

	private parseHexColor(input?: string | null): number | null {
		if (!input) return null;

		const normalized = input.replace(/^#|^0x/i, '');
		if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
			return null;
		}

		return Number.parseInt(normalized, 16);
	}
}
