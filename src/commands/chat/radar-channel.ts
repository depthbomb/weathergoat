import { db } from '@db';
import { _ } from '@lib/i18n';
import { Tokens } from '@container';
import { Colors } from '@constants';
import { BaseCommand } from '@commands';
import { Duration } from '@sapphire/time-utilities';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError } from '@lib/errors';
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
import type { HTTPRequestError } from '@lib/errors';
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

		this._location = container.resolve(Tokens.Location);
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
			content: _('commands.radarChannel.coordLocationAskConfirmation', { latitude, longitude, info }),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const embed = new EmbedBuilder()
					.setColor(Colors.Primary)
					.setTitle(_('jobs.radar.embedTitle', { info }))
					.setFooter({ text: _('jobs.radar.embedFooter') })
					.setImage(info.radarImageUrl)
					.addFields(
						{ name: _('jobs.radar.lastUpdatedTitle'), value: time(new Date(), 'R'), inline: true },
						{ name: _('jobs.radar.nextUpdateTitle'), value: time(new Duration('5m').fromNow, 'R'), inline: true },
					)

				const guildId      = interaction.guildId!;
				const channelId    = channel.id;
				const firstMessage = await channel.send({ embeds: [embed] });

				await db.radarChannel.create({
					data: {
						guildId,
						channelId,
						messageId: firstMessage.id,
						location: info.location,
						radarStation: info.radarStation,
						radarImageUrl: info.radarImageUrl
					}
				});

				await interaction.editReply({ content: _('commands.radarChannel.destCreated'), components: [] });
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
}
