import { db } from '@db';
import { _ } from '@lib/i18n';
import { locationService } from '@services/location';
import { captureError, isDiscordJSError, isWeatherGoatError, MaxDestinationError } from '@lib/errors';
import {
	codeBlock,
	ChannelType,
	ButtonStyle,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	DiscordjsErrorCodes
} from 'discord.js';
import type { ICommand } from '@commands';
import type { HTTPRequestError } from '@lib/errors';
import type { Message, CacheType, InteractionResponse, ChatInputCommandInteraction } from 'discord.js';

interface IAlertsCommand extends ICommand {
	[kAddSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean> | InteractionResponse<boolean>>;
	[kRemoveSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean> | InteractionResponse<boolean>>;
	[kListSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean> | InteractionResponse<boolean>>;
}

const kAddSubcommand    = Symbol('add-subcommand');
const kRemoveSubcommand = Symbol('remove-subcommand');
const kListSubcommand   = Symbol('list-subcommand');

export const alertsCommand: IAlertsCommand = ({
	data: new SlashCommandBuilder()
	.setName('alerts')
	.setDescription('Alerts super command')
	.setDMPermission(false)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
		.setDescription('Lists all alert reporting destinations in the server')
	),

	async [kAddSubcommand](interaction) {
		const maxCount     = process.env.MAX_ALERT_DESTINATIONS_PER_GUILD;
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
		MaxDestinationError.assert(existingCount < maxCount, 'You have reached the maximum amount of alert destinations in this server.', { max: maxCount });

		if (!locationService.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		const exists = await db.alertDestination.exists({ latitude, longitude, channelId });
		if (exists) {
			return interaction.reply(_('commands.alerts.err.destExists'));
		}

		await interaction.deferReply();

		try {
			const info = await locationService.getInfoFromCoordinates(latitude, longitude);

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

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 15_000 });
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
			if (isWeatherGoatError<HTTPRequestError>(err)) {
				return interaction.editReply({ content: _('common.err.locationQueryHttpError', { err }), components: [] });
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				return interaction.editReply({ content: _('common.promptTimedOut'), components: [] });
			}

			return interaction.editReply({ content: _('common.err.unknown'), components: [] });
		}
	},
	async [kRemoveSubcommand](interaction) {
		const id = interaction.options.getString('id', true);

		await interaction.deferReply();

		const exists = await db.alertDestination.exists({ id });
		if (!exists) {
			return interaction.editReply(_('commands.alerts.err.noDestById', { id }));
		}

		try {
			await db.alertDestination.delete({ where: { id } });
			return interaction.editReply(_('commands.alerts.destRemoved'));
		} catch (err: unknown) {
			captureError('Failed to remove alert destination', err, { id });
			return interaction.editReply(_('commands.alerts.err.couldNotRemoveDest'));
		}
	},
	async [kListSubcommand](interaction) {
		const guildId = interaction.guildId!;

		await interaction.deferReply();

		const destinations = await db.alertDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				channelId: true,
				autoCleanup: true,
				pingOnSevere: true
			},
			where: {
				guildId
			}
		});
		if (!destinations.length) {
			return interaction.editReply(_('common.err.noDestinations', { type: 'alert' }));
		}

		const embed = new EmbedBuilder()
			.setColor(interaction.client.brandColor)
			.setTitle(_('commands.alerts.listEmbedTitle'));

		for (const { id, latitude, longitude, channelId, autoCleanup, pingOnSevere } of destinations) {
			const info    = await locationService.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					_('common.reportingTo', { location: channel }),
					codeBlock('json', JSON.stringify({ id, autoCleanup, pingOnSevere }, null, 4))
				].join('\n')
			});
		}

		return interaction.editReply({ embeds: [embed] });
	},

	async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'add' | 'remove' | 'list';
		switch (subcommand) {
			case 'add':
				return this[kAddSubcommand](interaction);
			case 'remove':
				return this[kRemoveSubcommand](interaction);
			case 'list':
				return this[kListSubcommand](interaction);
		}
	}
});
