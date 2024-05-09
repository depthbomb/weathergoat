import { db } from '@db';
import { Command } from '@commands';
import { isValidCoordinates, getInfoFromCoordinates } from '@lib/location';
import { ChannelType, ButtonStyle, ButtonBuilder, ActionRowBuilder, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class RadarCommand extends Command {
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

		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();

		if (!isValidCoordinates(latitude, longitude)) {
			return interaction.reply('The provided latitude or longitude is not valid.');
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
			content: `The location found for coordinates \`${latitude},${longitude}\` is **${info.location}** with the radar image below.\nIs this correct?\n${info.radarImageUrl}`,
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const embed = new EmbedBuilder()
					.setColor(interaction.client.brandColor)
					.setTitle(`Radar for ${info.location} (${info.radarStation})`)
					.setFooter({ text: 'This is the closest station for this location' })
					.setImage(info.radarImageUrl);

				const guildId     = interaction.guildId!;
				const channelId   = channel.id;
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

				await interaction.editReply({ content: `Radar channel successfully added in ${channel}!\nNote that I will only update my initial message in the channel so you should disallow members from sending messages in it.`, components: [] });
			} else {
				return initialReply.delete();
			}
		} catch (err: unknown) {
			return interaction.editReply({ content: 'Confirmation cancelled', components: [] });
		}
	}
}
