import { db } from '@db';
import { _ } from '@i18n';
import { tokens } from '@container';
import { v7 as uuidv7 } from 'uuid';
import { BaseCommand } from '@commands';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError } from '@errors';
import {
	time,
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

export default class RadarChannelCommand extends BaseCommand {
	private readonly _location: ILocationService;

	public constructor(container: Container) {
		super({
			data: new SlashCommandBuilder()
			.setName('radar-channel')
			.setDescription('Designates a channel to post auto-updating radar images for a region')
			.setDMPermission(false)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addChannelOption(o => o
				.setName('channel')
				.setDescription('The channel')
				.setRequired(true)
			)
			.addStringOption(o => o
				.setName('latitude')
				.setDescription('The latitude of the area')
				.setRequired(true)
			)
			.addStringOption(o => o
				.setName('longitude')
				.setDescription('The longitude of the area')
				.setRequired(true)
			),
			preconditions: [
				new CooldownPrecondition({ duration: '5s', global: true })
			]
		});

		this._location = container.resolve(tokens.location);
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		const maxCount = process.env.MAX_RADAR_CHANNELS_PER_GUILD;
		const guildId = interaction.guildId;
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const latitude = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		const existingCount = await db.radarChannel.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, 'You have reached the maximum amount of radar channels in this server.', { max: maxCount });

		if (!this._location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		const location = await this._location.getInfoFromCoordinates(latitude, longitude);
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
			content: _('commands.radarChannel.coordLocationAskConfirmation', { latitude, longitude, location }),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const guildId      = interaction.guildId!;
				const channelId    = channel.id;
				await db.radarChannel.create({
					data: {
						uuid: uuidv7(),
						guildId,
						channelId,
						location: location.location,
						radarStation: location.radarStation,
						radarImageUrl: location.radarImageUrl
					}
				});

				await interaction.editReply({
					content: _('commands.radarChannel.destCreated', {
						mention: channel.toString()
					}),
					components: []
				});
			} else {
				return initialReply.delete();
			}
		} catch (err) {
			if (isWeatherGoatError<HTTPRequestError>(err)) {
				return interaction.editReply({ content: _('common.err.locationQueryHttpError', { err }), components: [] });
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				return interaction.editReply({ content: _('common.promptTimedOut'), components: [] });
			}

			return interaction.editReply({ content: _('common.err.unknown'), components: [] });
		}
	}
}
