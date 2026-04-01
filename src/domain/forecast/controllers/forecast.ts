import { env } from '@env';
import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { assume } from '@depthbomb/common/typing';
import { generateSnowflake } from '@lib/snowflake';
import { inject, injectable } from '@needle-di/core';
import { LocationService } from '@services/location';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isGuildMember } from '@sapphire/discord.js-utilities';
import { command, component, BaseInteractionController } from '@infra/controllers';
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
import type { ComponentMatch } from '@infra/components';
import type { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';

@injectable()
export default class ForecastController extends BaseInteractionController {
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

	@command()
	private async createForecastCommand(interaction: ChatInputCommandInteraction) {
		const maxCount  = env.get('MAX_FORECAST_DESTINATIONS_PER_GUILD');
		const guildId   = interaction.guildId!;
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.forecastDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, $msg.commands.forecasts.errors.maxDestinationsReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply($msg.errors.invalidCoordinates());
		}

		await interaction.deferReply();

		try {
			const lookup = await this.location.getInfoFromCoordinatesOrNearest(latitude, longitude);
			const info   = lookup.info;
			const locationPrompt = lookup.wasAdjusted
				? $msg.common.prompts.locationConfirmAdjusted(
					lookup.requestedLatitude,
					lookup.requestedLongitude,
					info.latitude,
					info.longitude,
					info.location
				)
				: $msg.common.prompts.locationConfirm(info.latitude, info.longitude, info.location);
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
				content: locationPrompt,
				components: [row]
			});

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30_000 });
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
						latitude: info.latitude,
						longitude: info.longitude,
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
					await interaction.editReply({
						content: $msg.errors.locationNotFound(),
						components: []
					});
				} else {
					await interaction.editReply({
						content: $msg.errors.locationLookupHttpError(err.code, err.status),
						components: []
					});
				}
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ content: $msg.common.notices.promptTimedOut(), components: [] });
			} else {
				reportError('Error creating forecast destination', err);
				await interaction.editReply({ content: $msg.errors.unknown(), components: [] });
			}
		}
	}

	@component('delete-forecast:*')
	private async handleDeleteForecastComponent(interaction: MessageComponentInteraction, match: ComponentMatch) {
		if (!interaction.member || !isGuildMember(interaction.member)) {
			return;
		}

		if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				content: $msg.components.deleteForecastButton.noPermission(),
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await interaction.deferUpdate();

		const { guildId, channelId } = interaction;
		const [messageId]            = match.wildcards;

		assume<string>(guildId);
		assume<string>(channelId);

		const where = { guildId, channelId, messageId };

		const forecastMessage = await db.forecastDestination.findFirst({ where });
		if (!forecastMessage) {
			await interaction.reply({
				content: $msg.components.deleteForecastButton.couldNotFindMessage(),
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await db.forecastDestination.delete({ where });
		await interaction.message.delete();
	}
}
