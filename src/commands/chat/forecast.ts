import { db } from '@db';
import { env } from '@env';
import { $msg } from '@lib/messages';
import { BaseCommand } from '@commands';
import { reportError } from '@lib/logger';
import { generateSnowflake } from '@lib/snowflake';
import { inject, injectable } from '@needle-di/core';
import { LocationService } from '@services/location';
import { CooldownPrecondition } from '@preconditions/cooldown';
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

@injectable()
export default class ForecastCommand extends BaseCommand {
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
		const latitude  = interaction.options.getString('latitude', true);
		const longitude = interaction.options.getString('longitude', true);
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, $msg.commands.forecasts.errors.maxDestinationsReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply($msg.errors.invalidCoordinates());
		}

		await interaction.deferReply();

		try {
			const info = await this.location.getInfoFromCoordinates(latitude, longitude);
			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
					.setCustomId('confirm')
					.setLabel($msg.common.buttons.yes())
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('deny')
					.setLabel($msg.common.buttons.no())
					.setStyle(ButtonStyle.Danger)
			);

			const initialReply = await interaction.editReply({
				content: $msg.common.prompts.locationConfirm(latitude, longitude, info.location),
				components: [row]
			});

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const forecastJob    = Array.from(interaction.client.jobs).find(j => j.job.name === 'report_forecasts')!;
				const initialMessage = await channel.send({
					content: $msg.commands.forecasts.placeholderMessage(info.location, time(forecastJob.cron.nextRun()!, 'R')),
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

				await interaction.editReply({ content: $msg.commands.forecasts.created(channel.toString()), components: [] });
			} else {
				await initialReply.delete();
			}
		} catch (err: unknown) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				if (err.code === 404) {
					await interaction.editReply({ content: $msg.errors.locationNotFound(), components: [] });
				} else {
					await interaction.editReply({ content: $msg.errors.locationLookupHttpError(err.code, err.status), components: [] });
				}
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ content: $msg.common.notices.promptTimedOut(), components: [] });
			} else {
				reportError('Error creating forecast destination', err);
				await interaction.editReply({ content: $msg.errors.unknown(), components: [] });
			}
		}
	}
}
