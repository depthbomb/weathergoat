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

export default class AlertsCommand extends Command {
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
				return this._addDestinationSubcommand(interaction);
			case 'remove':
				return this._removeDestinationSubcommand(interaction);
			case 'list':
				return this._listDestinationsSubcommand(interaction);
		}
	}

	private async _addDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionsBitField.Flags.ManageGuild);

		const channelId    = interaction.channelId;
		const latitude     = interaction.options.getString('latitude', true);
		const longitude    = interaction.options.getString('longitude', true);
		const channel      = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup  = interaction.options.getBoolean('auto-cleanup') ?? true;
		const pingOnSevere = interaction.options.getBoolean('ping-on-severe') ?? false;

		if (!isValidCoordinates(latitude, longitude)) {
			return interaction.reply('The provided latitude or longitude is not valid.');
		}

		const exists = await db.alertDestination.exists({ latitude, longitude, channelId });
		if (exists) {
			return interaction.reply('This channel is already designated as an alert destination.');
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
				const destination = await db.alertDestination.create({
					data: {
						latitude,
						longitude,
						zoneId: info.zoneId,
						countyId: info.countyId,
						channelId: channel.id,
						autoCleanup,
						pingOnSevere,
						radarImageUrl: info.radarImageUrl
					},
					select: { id: true }
				});

				let message = `Alert reporting created in ${channel}!`;
				if (autoCleanup) {
					message = `${message} My alert messages will be deleted automatically when they expire.`;
				}

				if (pingOnSevere) {
					message = `${message}\nI will ping everyone in the server if there is a severe or extreme alert.`;
				}

				message = `${message}\nYou can remove this reporting destination by using the \`/alerts remove\` command with the ID \`${destination.id}\`.`;

				return interaction.editReply({ content: message, components: [] });
			} else {
				return initialReply.delete();
			}
		} catch (err: unknown) {
			return interaction.editReply({ content: 'Confirmation cancelled', components: [] });
		}
	}

	private async _removeDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionsBitField.Flags.ManageGuild);

		const id = interaction.options.getString('id', true);

		await interaction.deferReply();

		const exists = await db.alertDestination.exists({ id });
		if (!exists) {
			return interaction.editReply(`No alert destination exists with the ID \`${id}\`.`);
		}

		try {
			await db.alertDestination.delete({ where: { id } });
			await interaction.editReply('Alert reporting destination has been successfully removed.');
		} catch (err: unknown) {
			captureError('Failed to remove alert destination', err, { id });
			await interaction.editReply('I was unable to remove that alert destination.');
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
			return interaction.editReply(`${channel} does not have any alert reporting assigned to it.`);
		}

		const embed = new EmbedBuilder().setTitle(`Alert reporting destinations for ${channel.name}`);

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
