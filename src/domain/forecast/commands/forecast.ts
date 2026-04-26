import { env } from '@env';
import { db } from '@database';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { generateSnowflake } from '@lib/snowflake';
import { LocationService } from '@services/location';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { ReportForecastsJob } from '@domain/forecast/jobs/report-forecast';
import {
	HTTPRequestError,
	isDiscordJSError,
	isWeatherGoatError,
	MaxDestinationError,
	GuildOnlyInvocationInNonGuildError
} from '@errors';
import {
	time,
	ButtonStyle,
	ChannelType,
	MessageFlags,
	ButtonBuilder,
	ActionRowBuilder,
	DiscordjsErrorCodes,
	PermissionFlagsBits,
	SlashCommandBuilder
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export class ForecastCommand extends BaseCommand {
	public constructor(
		private readonly location = inject(LocationService)
	) {
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
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		const maxCount  = env.get('MAX_FORECAST_DESTINATIONS_PER_GUILD');
		const guildId   = interaction.guildId!;
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, $msg.forecasts.command.errors.maxDestinationsReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			await interaction.reply($msg.shared.errors.invalidCoordinates());
			return;
		}

		await interaction.deferReply();

		try {
			const location = await this.location.resolveCoordinates(latitude, longitude);
			const locationPrompt = location.wasAdjusted
				? $msg.shared.prompts.locationConfirmAdjusted(
					location.requested.latitude,
					location.requested.longitude,
					location.latitude,
					location.longitude,
					location.name
				)
				: $msg.shared.prompts.locationConfirm(location.latitude, location.longitude, location.name);
			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('confirm')
						.setLabel($msg.shared.buttons.yes())
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder()
						.setCustomId('deny')
						.setLabel($msg.shared.buttons.no())
						.setStyle(ButtonStyle.Danger)
				);

			const initialReply = await interaction.editReply({
				content: locationPrompt,
				components: [row]
			});

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30_000 });
			if (customId === 'confirm') {
				const forecastJob    = Array.from(interaction.client.jobs).find(j => j.job.name === ReportForecastsJob.name)!;
				const initialMessage = await channel.send({
					content: $msg.forecasts.command.placeholderMessage(location.name, time(forecastJob.cron.nextRun()!, 'R')),
					flags: MessageFlags.SuppressNotifications
				});
				const snowflake = generateSnowflake();

				await db.forecastDestination.create({
					data: {
						snowflake,
						latitude: location.latitude,
						longitude: location.longitude,
						guildId,
						channelId: channel.id,
						messageId: initialMessage.id,
						radarImageUrl: location.radar.reflectivityImageUrl
					}
				});

				await interaction.editReply({ content: $msg.forecasts.command.created(channel.toString()), components: [] });
			} else {
				await initialReply.delete();
			}
		} catch (err: unknown) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				if (err.code === 404) {
					await interaction.editReply({
						content: $msg.shared.errors.locationNotFound(),
						components: []
					});
				} else {
					await interaction.editReply({
						content: $msg.shared.errors.locationLookupHttpError(err.code, err.status),
						components: []
					});
				}
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ content: $msg.shared.notices.promptTimedOut(), components: [] });
			} else {
				reportError('Error creating forecast destination', err);
				await interaction.editReply({ content: $msg.shared.errors.unknown(), components: [] });
			}
		}
	}
}
