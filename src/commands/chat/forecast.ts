import { db } from '@db';
import { _ } from '@i18n';
import { tokens } from '@container';
import { Colors } from '@constants';
import { reportError } from '@logger';
import { BaseCommand } from '@commands';
import { v7 as uuidv7, validate as isUuidValid } from 'uuid';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError } from '@errors';
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
import type { Container } from '@container';
import type { HTTPRequestError } from '@errors';
import type { ILocationService } from '@services/location';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class ForecastCommand extends BaseCommand {
	private readonly _location: ILocationService;

	public constructor(container: Container) {
		super({
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
				.addStringOption(o => o.setName('uuid').setDescription('The UUID of the forecast destination to delete').setRequired(true))
			)
			.addSubcommand(sc => sc
				.setName('list')
				.setDescription('Lists all forecast reporting destinations in the server')
			),
			preconditions: [
				new CooldownPrecondition({ duration: '5s', global: true })
			]
		});

		this._location = container.resolve(tokens.location);

		this.createSubcommandMap<'add' | 'remove' | 'list'>({
			add: { handler: this._handleAddSubcommand },
			remove: { handler: this._handleRemoveSubcommand },
			list: { handler: this._handleListSubcommand },
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleAddSubcommand(interaction: ChatInputCommandInteraction) {
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

		if (!this._location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		try {
			const info = await this._location.getInfoFromCoordinates(latitude, longitude);
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
						uuid: uuidv7(),
						latitude,
						longitude,
						guildId,
						channelId,
						autoCleanup,
						radarImageUrl: info.radarImageUrl
					},
					select: { uuid: true }
				});

				return interaction.editReply({
					content: _('commands.forecasts.destCreated', {
						mention: channel.toString(),
						destination
					}),
					components: []
				});
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
	}

	private async _handleRemoveSubcommand(interaction: ChatInputCommandInteraction) {
		const uuid = interaction.options.getString('uuid', true);

		if (!isUuidValid(uuid)) {
			return interaction.reply(_('common.err.invalidUuid', { uuid }));
		}

		await interaction.deferReply();

		const exists = await db.forecastDestination.exists({ uuid });
		if (!exists) {
			return interaction.editReply(_('commands.forecasts.err.noDestByUuid', { uuid }));
		}

		try {
			await db.forecastDestination.delete({ where: { uuid } });
			return interaction.editReply(_('commands.forecasts.destRemoved'));
		} catch (err: unknown) {
			reportError('Failed to remove forecast destination', err, { uuid });
			return interaction.editReply(_('commands.forecasts.err.couldNotRemoveDest'));
		}
	}

	private async _handleListSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId;

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		const channel = interaction.channel;

		await interaction.deferReply();

		const destinations = await db.forecastDestination.findMany({
			select: {
				uuid: true,
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
			.setColor(Colors.Primary)
			.setTitle(_('commands.forecasts.listEmbedTitle', { channel }));

		for (const { uuid, latitude, longitude, channelId, autoCleanup } of destinations) {
			const info    = await this._location.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					_('common.reportingTo', { location: channel }),
					codeBlock('json', JSON.stringify({ uuid, autoCleanup }, null, 4))
				].join('\n')
			});
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
