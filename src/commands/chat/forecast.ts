import { db } from '@db';
import { _ } from '@i18n';
import { Color } from '@constants';
import { tokens } from '@container';
import { reportError } from '@logger';
import { BaseCommand } from '@commands';
import { generateSnowflake } from '@snowflake';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError, GuildOnlyInvocationInNonGuildError } from '@errors';
import {
	time,
	codeBlock,
	ChannelType,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
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
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addSubcommand(sc => sc
				.setName('add')
				.setDescription('Designates a channel for posting hourly weather forecasts to')
				.addStringOption(o => o.setName('latitude').setDescription('The latitude of the area to report the forecast of').setRequired(true))
				.addStringOption(o => o.setName('longitude').setDescription('The longitude of the area to report the forecast of').setRequired(true))
				.addChannelOption(o => o.setName('channel').setDescription('The channel in which to send hourly forecasts to').setRequired(true))
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

		this.createSubcommandMap<'add' | 'list'>({
			add: { handler: this._handleAddSubcommand },
			list: { handler: this._handleListSubcommand },
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleAddSubcommand(interaction: ChatInputCommandInteraction) {
		const maxCount = process.env.MAX_FORECAST_DESTINATIONS_PER_GUILD;
		const guildId = interaction.guildId!;
		const latitude = interaction.options.getString('latitude', true);
		const longitude = interaction.options.getString('longitude', true);
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, _('commands.forecasts.err.maxDestinationsReached'), { max: maxCount });

		if (!this._location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		try {
			const info = await this._location.getInfoFromCoordinates(latitude, longitude);
			const row = new ActionRowBuilder<ButtonBuilder>()
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
				const forecastJob = interaction.client.jobs.find(j => j.job.name === 'report_forecasts')!;
				const initialMessage = await channel.send({
					content: `This message will be edited for the hourly forecast.\nUpdating ${time(forecastJob.cron.nextRun()!, 'R')}.`,
					flags: MessageFlags.SuppressNotifications
				});
				const snowflake = generateSnowflake().toString();

				await db.forecastDestination.create({
					data: {
						snowflake,
						latitude,
						longitude,
						guildId,
						channelId: channel.id,
						messageId: initialMessage.id,
						radarImageUrl: info.radarImageUrl
					}
				});

				await interaction.editReply({ content: _('commands.forecasts.destCreated', { channel }), components: [] });
			} else {
				await initialReply.delete();
			}
		} catch (err: unknown) {
			if (isWeatherGoatError<HTTPRequestError>(err)) {
				await interaction.editReply({ content: _('common.err.locationQueryHttpError', { err }), components: [] });
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ content: _('common.promptTimedOut'), components: [] });
			} else {
				reportError('Error creating forecast destination', err);
				await interaction.editReply({ content: _('common.err.unknown'), components: [] });
			}
		}
	}

	private async _handleListSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply(_('common.err.guildOnly'));
		}

		await interaction.deferReply();

		const destinations = await db.forecastDestination.findMany({
			select: {
				id: true,
				latitude: true,
				longitude: true,
				channelId: true,
				messageId: true
			},
			where: {
				guildId
			}
		});
		if (!destinations.length) {
			return interaction.editReply(_('common.err.noDestinations', { type: 'forecast reporting' }));
		}

		const embed = new EmbedBuilder()
			.setColor(Color.Primary)
			.setTitle(_('commands.forecasts.listEmbedTitle'));

		for (const { id, latitude, longitude, channelId, messageId } of destinations) {
			const info    = await this._location.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					_('common.reportingTo', { channel }),
					codeBlock('json', JSON.stringify({ id, messageId }, null, 4))
				].join('\n')
			});
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
