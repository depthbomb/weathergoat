import { db } from '@db';
import { eq } from 'drizzle-orm';
import { Command } from '@commands';
import { alertDestinations } from '@db/schemas';
import { isSnowflakeValid, generateSnowflake } from '@lib/snowflake';
import { isValidCoordinates, getInfoFromCoordinates } from '@lib/location';
import { codeBlock, ChannelType, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
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
				.addStringOption(o => o.setName('snowflake').setDescription('The snowflake of the alert destination to delete').setRequired(true))
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
				return this._addDestination(interaction);
			case 'remove':
				return this._removeDestination(interaction);
			case 'list':
				return this._listDestinations(interaction);
		}
	}

	private async _addDestination(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionsBitField.Flags.ManageGuild);

		const latitude     = interaction.options.getString('latitude', true);
		const longitude    = interaction.options.getString('longitude', true);
		const channel      = interaction.options.getChannel('channel', true);
		const autoCleanup  = interaction.options.getBoolean('auto-cleanup') ?? true;
		const pingOnSevere = interaction.options.getBoolean('ping-on-severe') ?? false;

		if (!isValidCoordinates(latitude, longitude)) {
			return interaction.reply({ content: 'The provided latitude or longitude is not valid.' });
		}

		if (channel.type !== ChannelType.GuildText) {
			return interaction.reply({ content: 'Target channel must be a text channel.' });
		}

		await interaction.deferReply();

		const exists = await db.query.alertDestinations.findFirst({
			where: (a, { eq, and }) => and(
				eq(a.latitude, latitude),
				eq(a.longitude, longitude),
				eq(a.channelId, channel.id)
			)
		});
		if (exists) {
			return interaction.editReply('This channel is already designated as an alert destination.');
		}

		const coordinateInfo = await getInfoFromCoordinates(latitude, longitude);
		const snowflake      = generateSnowflake();

		await db.insert(alertDestinations).values({
			snowflake,
			latitude,
			longitude,
			zoneId: coordinateInfo.zoneId,
			countyId: coordinateInfo.countyId,
			channelId: channel.id,
			autoCleanup,
			pingOnSevere,
			radarImageUrl: coordinateInfo.radarImageUrl
		});

		let message = 'Alert reporting created!';
		if (autoCleanup) {
			message = `${message} My alert messages will be deleted automatically when they expire.`;
		}

		if (pingOnSevere) {
			message = `${message}\nI will ping everyone in the server if there is a severe or extreme alert.`;
		}

		message = `${message}\nYou can remove this reporting destination by using the \`/alerts remove\` command with the snowflake \`${snowflake}\`.`;

		await interaction.editReply(message);
	}

	private async _removeDestination(interaction: ChatInputCommandInteraction<CacheType>) {
		this.assertPermissions(interaction, PermissionsBitField.Flags.ManageGuild);

		const snowflake = interaction.options.getString('snowflake', true);
		if (!isSnowflakeValid(snowflake)) {
			return interaction.reply('The provided snowflake is not valid.');
		}

		await interaction.deferReply();

		const where       = eq(alertDestinations.snowflake, snowflake);
		const destination = await db.query.alertDestinations.findFirst({ where });
		if (!destination) {
			return interaction.editReply(`There is no alert reporting destination with the snowflake \`${snowflake}\`.`);
		}

		await db.delete(alertDestinations).where(where);
		await interaction.editReply('Alert reporting destination has been successfully removed.');
	}

	private async _listDestinations(interaction: ChatInputCommandInteraction<CacheType>) {
		const channel = interaction.options.getChannel('channel', true);

		await interaction.deferReply();

		const destinations = await db.select({
			snowflake: alertDestinations.snowflake,
			latitude: alertDestinations.latitude,
			longitude: alertDestinations.longitude,
			autoCleanup: alertDestinations.autoCleanup,
			pingOnSevere: alertDestinations.pingOnSevere,
		}).from(alertDestinations).where(eq(alertDestinations.channelId, channel.id));
		if (destinations.length === 0) {
			return interaction.editReply(`${channel} does not have any alert reporting assigned to it.`);
		}

		const embed = new EmbedBuilder().setTitle(`Alert reporting destinations for ${channel.name}`);

		for (const { snowflake, latitude, longitude, autoCleanup, pingOnSevere } of destinations) {
			const info = await getInfoFromCoordinates(latitude, longitude);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: codeBlock('json', JSON.stringify({ snowflake, autoCleanup, pingOnSevere }, null, 4))
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
