import { db } from '@db';
import { _ } from '@lib/i18n';
import { locationService } from '@services/location';
import { cooldownPrecondition } from '@preconditions/cooldownPrecondition';
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

interface IForecastsCommand extends ICommand {
	[kAddSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean> | InteractionResponse<boolean>>;
	[kRemoveSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean>>;
	[kListSubcommand](interaction: ChatInputCommandInteraction<CacheType>): Promise<Message<boolean> | InteractionResponse<boolean>>;
}

const kAddSubcommand = Symbol('add-subcommand');
const kRemoveSubcommand = Symbol('remove-subcommand');
const kListSubcommand = Symbol('list-subcommand');

export const forecastsCommand: IForecastsCommand = ({
	data: new SlashCommandBuilder()
	.setName('forecasts')
	.setDescription('Forecasts super command')
	.setDMPermission(false)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addSubcommand(sc => sc
		.setName('add')
		.setDescription('Designates a channel for posting hourly weather forecasts to')
		.addStringOption(o => o.setName('latitude').setDescription('The latitude of the area to report the forecast of').setRequired(true))
		.addStringOption(o => o.setName('longitude').setDescription('The longitude of the area to report the forecast of').setRequired(true))
		.addChannelOption(o => o.setName('channel').setDescription('The channel in which to send hourly forecasts to').setRequired(true))
		.addBooleanOption(o => o.setName('auto-cleanup').setDescription('Whether my messages should be deleted periodically (true by default)').setRequired(false))
	)
	.addSubcommand(sc => sc
		.setName('remove')
		.setDescription('Removes a forecast reporting destination')
		.addStringOption(o => o.setName('id').setDescription('The ID of the forecast destination to delete').setRequired(true))
	)
	.addSubcommand(sc => sc
		.setName('list')
		.setDescription('Lists all forecast reporting destinations in the server')
	),

	preconditions: [
		cooldownPrecondition({ duration: '5s', global: true })
	],

	async [kAddSubcommand](interaction) {
		const maxCount    = process.env.MAX_FORECAST_DESTINATIONS_PER_GUILD;
		const guildId     = interaction.guildId;
		const channelId   = interaction.channelId;
		const latitude    = interaction.options.getString('latitude', true);
		const longitude   = interaction.options.getString('longitude', true);
		const channel     = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup = interaction.options.getBoolean('auto-cleanup') ?? true;

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, 'You have reached the maximum amount of forecast destinations in this server.', { max: maxCount });

		if (!locationService.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		try {
			const info = await locationService.getInfoFromCoordinates(latitude, longitude);
			const row  = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('confirm')
						.setLabel(_('common.yes'))
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder()
						.setCustomId('deny')
						.setLabel(_('common.no'))
						.setStyle(ButtonStyle.Danger)
				);

			const initialReply = await interaction.editReply({
				content: _('common.coordLocationAskConfirmation', { latitude, longitude, info }),
				components: [row]
			});

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const destination = await db.forecastDestination.create({
					data: {
						latitude,
						longitude,
						guildId,
						channelId,
						autoCleanup,
						radarImageUrl: info.radarImageUrl
					},
					select: { id: true }
				});

				return interaction.editReply({ content: _('commands.forecasts.destCreated', { channel, destination }), components: [] });
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

		const exists = await db.forecastDestination.exists({ id });
		if (!exists) {
			return interaction.editReply(_('commands.forecasts.err.noDestById', { id }));
		}

		try {
			await db.forecastDestination.delete({ where: { id } });
			return interaction.editReply(_('commands.forecasts.destRemoved'));
		} catch (err: unknown) {
			captureError('Failed to remove forecast destination', err, { id });
			return interaction.editReply(_('commands.forecasts.err.couldNotRemoveDest'));
		}
	},
	async [kListSubcommand](interaction) {
		const guildId = interaction.guildId;
		const channel = interaction.options.getChannel('channel', true);

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		await interaction.deferReply();

		const destinations = await db.forecastDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				channelId: true,
				autoCleanup: true
			},
			where: {
				guildId
			}
		});
		if (!destinations.length) {
			return interaction.editReply(_('common.err.noDestinations', { type: 'forecast reporting' }));
		}

		const embed = new EmbedBuilder()
			.setColor(interaction.client.brandColor)
			.setTitle(_('commands.forecasts.listEmbedTitle', { channel }));

		for (const { id, latitude, longitude, channelId, autoCleanup } of destinations) {
			const info    = await locationService.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					_('common.reportingTo', { location: channel }),
					codeBlock('json', JSON.stringify({ id, autoCleanup }, null, 4))
				].join('\n')
			});
		}

		return interaction.editReply({ embeds: [embed] });
	},

	async handle(interaction) {
		const subcommand = interaction.options.getSubcommand(true) as 'add' | 'remove' | 'list';
		switch (subcommand) {
			case 'add':
				return this[kAddSubcommand](interaction);
			case 'remove':
				return this[kRemoveSubcommand](interaction);
			case 'list':
				return this[kListSubcommand](interaction);
		}
	},
});
