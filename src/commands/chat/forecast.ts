import { db } from '@db';
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
	PermissionsBitField,
	SlashCommandBuilder
} from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class ForecastsCommand extends Command {
	public constructor() {
		super(new SlashCommandBuilder()
			.setName('forecasts')
			.setDescription('Forecasts super command')
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
				.setDescription('Lists all forecast reporting destinations for a channel')
				.addChannelOption(o => o.setName('channel').setDescription('The channel to list forecast reporting destinations of').setRequired(true))
			));
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'add' | 'remove' | 'list';
		switch (subcommand) {
			case 'add':
				return this._addDestinationSubcommand(interaction);
			case 'remove':
				return this._removeDestinationSubcommand(interaction);
			case 'list':
				return this._listDestinationsSubcommand(interaction);
		}
	}

	private async _addDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionsBitField.Flags.ManageGuild);

		const channelId   = interaction.channelId;
		const latitude    = interaction.options.getString('latitude', true);
		const longitude   = interaction.options.getString('longitude', true);
		const channel     = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup = interaction.options.getBoolean('auto-cleanup') ?? true;

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
			content: `The location found for coordinates \`${latitude},${longitude}\` is **${info.location}**.\nIs this correct?`,
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const destination = await db.forecastDestination.create({
					data: {
						latitude,
						longitude,
						channelId: channel.id,
						autoCleanup,
						radarImageUrl: info.radarImageUrl
					},
					select: { id: true }
				});

				let message = `Hourly forecast reporting created in ${channel}!`;
				if (autoCleanup) {
					message = `${message} My messages will be deleted automatically after some time.`;
				}

				message = `${message}\nYou can remove this reporting destination by using the \`/forecasts remove\` command with the ID \`${destination.id}\`.`;

				return interaction.editReply({ content: message, components: [] });
			} else {
				return initialReply.delete();
			}
		} catch (err: unknown) {
			return interaction.editReply({ content: 'Confirmation cancelled', components: [] });
		}
	}

	private async _removeDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const id = interaction.options.getString('id', true);

		await interaction.deferReply();

		const exists = await db.forecastDestination.exists({ id });
		if (!exists) {
			return interaction.editReply(`No alert destination exists with the ID \`${id}\`.`);
		}

		try {
			await db.forecastDestination.delete({ where: { id } });
			await interaction.editReply('Forecast destination has been successfully removed.');
		} catch (err: unknown) {
			captureError('Failed to remove forecast destination', err, { id });
			await interaction.editReply('I was unable to remove that forecast destination.');
		}
	}

	private async _listDestinationsSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const channel = interaction.options.getChannel('channel', true);

		await interaction.deferReply();

		const destinations = await db.forecastDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				autoCleanup: true
			},
			where: {
				channelId: channel.id
			}
		});
		if (!destinations.length) {
			return interaction.editReply(`${channel} does not have any forecast reporting assigned to it.`);
		}

		const embed = new EmbedBuilder().setTitle('Forecast Reporting Destinations');

		for (const { id, latitude, longitude, autoCleanup } of destinations) {
			const info = await getInfoFromCoordinates(latitude, longitude);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: codeBlock('json', JSON.stringify({ id, autoCleanup }, null, 4))
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
