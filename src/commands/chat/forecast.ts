import { db } from '@db';
import { eq } from 'drizzle-orm';
import { Command } from '@commands';
import { forecastDestinations } from '@db/schemas';
import { isSnowflakeValid, generateSnowflake } from '@lib/snowflake';
import { isValidCoordinates, getInfoFromCoordinates } from '@lib/location';
import { codeBlock, ChannelType, EmbedBuilder, SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import type { CacheType, TextChannel, ChatInputCommandInteraction } from 'discord.js';

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
				.addStringOption(o => o.setName('snowflake').setDescription('The snowflake of the forecast destination to delete').setRequired(true))
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

		const latitude    = interaction.options.getString('latitude', true);
		const longitude   = interaction.options.getString('longitude', true);
		const channel     = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup = interaction.options.getBoolean('auto-cleanup') ?? true;

		await interaction.deferReply();

		const { snowflake } = await this._createDestination(channel, latitude, longitude, autoCleanup);

		let message = 'Hourly forecast reporting created!';
		if (autoCleanup) {
			message = `${message} My messages will be deleted automatically after some time.`;
		}

		message = `${message}\nYou can remove this reporting destination by using the \`/forecasts remove\` command with the snowflake \`${snowflake}\`.`;

		await interaction.editReply(message);
	}

	private async _removeDestinationSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const snowflake = interaction.options.getString('snowflake', true);
		if (!isSnowflakeValid(snowflake)) {
			return interaction.reply('The provided snowflake is not valid.');
		}

		await interaction.deferReply();

		const where       = eq(forecastDestinations.snowflake, snowflake);
		const destination = await db.query.forecastDestinations.findFirst({ where });
		if (!destination) {
			return interaction.editReply(`There is no forecast reporting destination with the snowflake \`${snowflake}\`.`);
		}

		await db.delete(forecastDestinations).where(where);
		await interaction.editReply('Forecast reporting destination has been successfully removed.');
	}

	private async _listDestinationsSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const channel = interaction.options.getChannel('channel', true);

		await interaction.deferReply();

		const destinations = await db.select({
			snowflake: forecastDestinations.snowflake,
			latitude: forecastDestinations.latitude,
			longitude: forecastDestinations.longitude,
			autoCleanup: forecastDestinations.autoCleanup
		}).from(forecastDestinations).where(eq(forecastDestinations.channelId, channel.id));

		if (destinations.length === 0) {
			return interaction.editReply('There are no forecast reporting destinations in this channel.');
		}

		const embed = new EmbedBuilder().setTitle('Forecast Reporting Destinations');

		for (const { snowflake, latitude, longitude, autoCleanup } of destinations) {
			const info = await getInfoFromCoordinates(latitude, longitude);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: codeBlock('json', JSON.stringify({ snowflake, autoCleanup }, null, 4))
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}

	private async _createDestination(channel: TextChannel, latitude: string, longitude: string, autoCleanup: boolean) {
		if (!isValidCoordinates(latitude, longitude)) {
			throw new Error('The provided latitude or longitude is not valid.');
		}

		const info      = await getInfoFromCoordinates(latitude, longitude);
		const snowflake = generateSnowflake();

		await db.insert(forecastDestinations).values({
			snowflake,
			latitude,
			longitude,
			channelId: channel.id,
			autoCleanup,
			radarImageUrl: info.radarImageUrl
		});

		return { snowflake };
	}
}
