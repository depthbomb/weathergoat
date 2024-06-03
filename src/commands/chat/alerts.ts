import { db } from '@db';
import { _ } from '@lib/i18n';
import { Command } from '@commands';
import { captureError } from '@lib/errors';
import { isValidCoordinates, getInfoFromCoordinates } from '@lib/location';
import {
	codeBlock,
	ChannelType,
	ButtonStyle,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder
} from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class AlertsCommand extends Command {
	private readonly _maxDestinations = process.env.MAX_ALERT_DESTINATIONS_PER_GUILD;

	public constructor() {
		super(new SlashCommandBuilder()
			.setName('alerts')
			.setDescription('Alerts super command')
			.addSubcommand(sc => sc
				.setName('add')
				.setDescription('Designates a channel for posting weather alerts to')
				.addStringOption(o => o.setName('latitude').setDescription('The latitude of the area to check for active alerts').setRequired(true))
				.addStringOption(o => o.setName('longitude').setDescription('The longitude of the area to check for active alerts').setRequired(true))
				.addChannelOption(o => o.setName('channel').setDescription('The channel in which to send alerts to').setRequired(true))
				.addBooleanOption(o => o.setName('auto-cleanup').setDescription('Whether my messages should be deleted periodically (true by default)').setRequired(false))
				.addBooleanOption(o => o.setName('ping-on-severe').setDescription('Whether to ping everyone when a severe or extreme alert is posted (false by default)').setRequired(false))
			)
			.addSubcommand(sc => sc
				.setName('remove')
				.setDescription('Removes an alert reporting destination')
				.addStringOption(o => o.setName('id').setDescription('The ID of the alert destination to delete').setRequired(true))
			)
			.addSubcommand(sc => sc
				.setName('list')
				.setDescription('Lists all alert reporting destinations for a channel')
				.addChannelOption(o => o.setName('channel').setDescription('The channel to list alert reporting destinations of').setRequired(true))
			));
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'add' | 'remove' | 'list';
		switch (subcommand) {
			case 'add':
				this.assertPermissions(interaction, PermissionFlagsBits.ManageGuild);
				return this._addDestinationSubcommand(interaction);
			case 'remove':
				this.assertPermissions(interaction, PermissionFlagsBits.ManageGuild);
				return this._removeDestinationSubcommand(interaction);
			case 'list':
				return this._listDestinationsSubcommand(interaction);
		}
	}

	private async _addDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const guildId      = interaction.guildId;
		const channelId    = interaction.channelId;
		const latitude     = interaction.options.getString('latitude', true);
		const longitude    = interaction.options.getString('longitude', true);
		const channel      = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup  = interaction.options.getBoolean('auto-cleanup') ?? true;
		const pingOnSevere = interaction.options.getBoolean('ping-on-severe') ?? false;

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		const existingCount = await db.alertDestination.countByGuild(guildId);
		if (existingCount >= this._maxDestinations) {
			return interaction.reply(_('common.err.tooManyDestinations', { type: 'alert', max: this._maxDestinations }));
		}

		if (!isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		const exists = await db.alertDestination.exists({ latitude, longitude, channelId });
		if (exists) {
			return interaction.reply(_('commands.alerts.err.destExists'));
		}

		await interaction.deferReply();

		const info = await getInfoFromCoordinates(latitude, longitude);

		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('confirm')
					.setLabel('Yes')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('deny')
					.setLabel('No')
					.setStyle(ButtonStyle.Danger)
			);

		const initialReply = await interaction.editReply({
			content: _('common.coordLocationAskConfirmation', { latitude, longitude, info }),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const destination = await db.alertDestination.create({
					data: {
						latitude,
						longitude,
						zoneId: info.zoneId,
						guildId,
						countyId: info.countyId,
						channelId: channel.id,
						autoCleanup,
						pingOnSevere,
						radarImageUrl: info.radarImageUrl
					},
					select: { id: true }
				});

				return interaction.editReply({ content: _('commands.alerts.destCreated', { channel, destination }), components: [] });
			} else {
				return initialReply.delete();
			}
		} catch (err: unknown) {
			return interaction.editReply({ content: _('common.confirmationCancelled'), components: [] });
		}
	}

	private async _removeDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const id = interaction.options.getString('id', true);

		await interaction.deferReply();

		const exists = await db.alertDestination.exists({ id });
		if (!exists) {
			return interaction.editReply(_('commands.alerts.err.noDestById', { id }));
		}

		try {
			await db.alertDestination.delete({ where: { id } });
			await interaction.editReply(_('commands.alerts.destRemoved'));
		} catch (err: unknown) {
			captureError('Failed to remove alert destination', err, { id });
			await interaction.editReply(_('commands.alerts.err.couldNotRemoveDest'));
		}
	}

	private async _listDestinationsSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const channel = interaction.options.getChannel('channel', true);

		await interaction.deferReply();

		const destinations = await db.alertDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				autoCleanup: true,
				pingOnSevere: true
			},
			where: {
				channelId: channel.id
			}
		});
		if (!destinations.length) {
			return interaction.editReply(_('commands.alerts.err.noDestInChannel', { channel }));
		}

		const embed = new EmbedBuilder().setTitle(_('commands.alerts.listEmbedTitle', { channel }));

		for (const { id, latitude, longitude, autoCleanup, pingOnSevere } of destinations) {
			const info = await getInfoFromCoordinates(latitude, longitude);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: codeBlock('json', JSON.stringify({ id, autoCleanup, pingOnSevere }, null, 4))
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
