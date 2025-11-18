import { db } from '@db';
import { _ } from '@i18n';
import { reportError } from '@logger';
import { container } from '@container';
import { BaseCommand } from '@commands';
import { generateSnowflake } from '@snowflake';
import { LocationService } from '@services/location';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError, GuildOnlyInvocationInNonGuildError } from '@errors';
import {
	time,
	ChannelType,
	ButtonStyle,
	MessageFlags,
	ButtonBuilder,
	ActionRowBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	DiscordjsErrorCodes
} from 'discord.js';
import type { HTTPRequestError } from '@errors';
import type { ILocationService } from '@services/location';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class ForecastCommand extends BaseCommand {
	private readonly location: ILocationService;

	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('forecasts')
			.setDescription('Designates a channel for posting hourly weather forecasts to')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addStringOption(o => o.setName('latitude').setDescription('The latitude of the area to report the forecast of').setRequired(true))
			.addStringOption(o => o.setName('longitude').setDescription('The longitude of the area to report the forecast of').setRequired(true))
			.addChannelOption(o => o.setName('channel').setDescription('The channel in which to send hourly forecasts to').setRequired(true)),
			preconditions: [
				new CooldownPrecondition({ duration: '5s', global: true })
			]
		});

		this.location = container.resolve(LocationService);
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		const maxCount  = process.env.MAX_FORECAST_DESTINATIONS_PER_GUILD;
		const guildId   = interaction.guildId!;
		const latitude  = interaction.options.getString('latitude', true);
		const longitude = interaction.options.getString('longitude', true);
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, _('commands.forecasts.err.maxDestinationsReached'), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		try {
			const info = await this.location.getInfoFromCoordinates(latitude, longitude);
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
				const forecastJob    = interaction.client.jobs.find(j => j.job.name === 'report_forecasts')!;
				const initialMessage = await channel.send({
					content: _('commands.forecasts.placeholderMessage', { location: info, time: time(forecastJob.cron.nextRun()!, 'R') }),
					flags: MessageFlags.SuppressNotifications
				});
				const snowflake = generateSnowflake();

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
}
