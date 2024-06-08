import { db } from '@db';
import { _ } from '@lib/i18n';
import { Command } from '@commands';
import { Duration } from '@sapphire/time-utilities';
import { locationService } from '@services/location';
import { time, ChannelType, ButtonStyle, EmbedBuilder, ButtonBuilder, ActionRowBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class RadarCommand extends Command {
	private readonly _maxCount = process.env.MAX_RADAR_CHANNELS_PER_GUILD;

	public constructor() {
		super(new SlashCommandBuilder()
			.setName('radar-channel')
			.setDescription('Designates a channel to post auto-updating radar images for a region')
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
			)
		);
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionFlagsBits.ManageGuild);

		const guildId   = interaction.guildId;
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();

		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		const existingCount = await db.radarChannel.countByGuild(guildId);
		if (existingCount >= this._maxCount) {
			return interaction.reply(_('common.err.tooManyDestinations', { type: 'radar channel', max: this._maxCount }));
		}

		if (!locationService.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

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
			content: _('commands.radarChannel.coordLocationAskConfirmation', { latitude, longitude, info }),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const embed = new EmbedBuilder()
					.setColor(interaction.client.brandColor)
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
			return interaction.editReply({ content: _('common.confirmationCancelled'), components: [] });
		}
	}
}
