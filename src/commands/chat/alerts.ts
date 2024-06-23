import { db } from '@db';
import { _ } from '@i18n';
import { Color } from '@constants';
import { tokens } from '@container';
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

export default class AlertsCommand extends BaseCommand {
	private readonly _location: ILocationService;

	public constructor(container: Container) {
		super({
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
				.addStringOption(o => o.setName('uuid').setDescription('The UUID of the alert destination to delete').setRequired(true))
			)
			.addSubcommand(sc => sc
				.setName('list')
				.setDescription('Lists all alert reporting destinations in the server')
			),
			preconditions: [
				new CooldownPrecondition({ duration: '3s', global: true })
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
		const maxCount = process.env.MAX_ALERT_DESTINATIONS_PER_GUILD;
		const guildId = interaction.guildId;
		const latitude = interaction.options.getString('latitude', true);
		const longitude = interaction.options.getString('longitude', true);
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup = interaction.options.getBoolean('auto-cleanup') ?? true;
		const pingOnSevere = interaction.options.getBoolean('ping-on-severe') ?? false;

		if (!guildId) return interaction.reply(_('common.err.guildOnly'));

		const existingCount = await db.alertDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, 'You have reached the maximum amount of alert destinations in this server.', {
			max: maxCount
		});

		if (!this._location.isValidCoordinates(latitude, longitude)) return interaction.reply(_('common.err.invalidLatOrLon'));

		await interaction.deferReply();

		const exists = await db.alertDestination.exists({ latitude, longitude, channelId: channel.id });
		if (exists) {
			return interaction.editReply(_('commands.alerts.err.destExists'));
		}

		try {
			const info = await this._location.getInfoFromCoordinates(latitude, longitude);
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
						uuid: uuidv7(),
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
					select: { uuid: true }
				});

				return interaction.editReply({
					content: _('commands.alerts.destCreated', {
						channel,
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

		const exists = await db.alertDestination.exists({ uuid });
		if (!exists) {
			return interaction.editReply(_('commands.alerts.err.noDestByUuid', { uuid }));
		}

		await db.alertDestination.delete({ where: { uuid } });
		await interaction.editReply(_('commands.alerts.destRemoved'));
	}

	private async _handleListSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId!;

		await interaction.deferReply();

		const destinations = await db.alertDestination.findMany({
			select: {
				uuid: true,
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
			.setColor(Color.Primary)
			.setTitle(_('commands.alerts.listEmbedTitle'));

		for (const { uuid, latitude, longitude, channelId, autoCleanup, pingOnSevere } of destinations) {
			const info = await this._location.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					_('common.reportingTo', { channel }),
					codeBlock('json', JSON.stringify({ uuid, autoCleanup, pingOnSevere }, null, 4))
				].join('\n')
			});
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
