import { env } from '@env';
import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { inject, injectable } from '@needle-di/core';
import { LocationService } from '@services/location';
import { EventBusService } from '@services/event-bus';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isValidSnowflake, generateSnowflake } from '@lib/snowflake';
import {
	HTTPRequestError,
	isDiscordJSError,
	isWeatherGoatError,
	MaxDestinationError,
	InvalidSnowflakeError,
	GuildOnlyInvocationInNonGuildError
} from '@errors';
import {
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	DiscordjsErrorCodes,
	PermissionFlagsBits,
	SlashCommandBuilder
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AlertsCommand extends BaseCommand {
	public constructor(
		private readonly eventBus = inject(EventBusService),
		private readonly location = inject(LocationService)
	) {
		super({
			data: new SlashCommandBuilder()
			.setName('alerts')
			.setDescription('Alerts super command')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
				.setDescription('Lists all alert reporting destinations in the server')
			),
			preconditions: [
				new CooldownPrecondition({ duration: '3s', global: true })
			]
		});

		this.createSubcommandMap<'add' | 'remove' | 'list'>({
			add: { handler: this._handleAddSubcommand },
			remove: { handler: this._handleRemoveSubcommand },
			list: { handler: this._handleListSubcommand },
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleAddSubcommand(interaction: ChatInputCommandInteraction) {
		const maxCount     = env.get('MAX_ALERT_DESTINATIONS_PER_GUILD');
		const guildId      = interaction.guildId;
		const latitude     = interaction.options.getString('latitude', true).trim();
		const longitude    = interaction.options.getString('longitude', true).trim();
		const channel      = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup  = interaction.options.getBoolean('auto-cleanup') ?? true;
		const pingOnSevere = interaction.options.getBoolean('ping-on-severe') ?? false;

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.alertDestination.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, $msg.commands.alerts.errors.maxDestinationsReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			await interaction.reply($msg.errors.invalidCoordinates());
			return;
		}

		await interaction.deferReply();

		try {
			const lookup = await this.location.getInfoFromCoordinatesOrNearest(latitude, longitude);
			const info   = lookup.info;
			const exists = await db.alertDestination.exists({
				latitude: info.latitude,
				longitude: info.longitude,
				channelId: channel.id
			});
			if (exists) {
				await interaction.editReply($msg.commands.alerts.errors.destinationExists());
				return;
			}

			const locationPrompt = lookup.wasAdjusted
				? $msg.common.prompts.locationConfirmAdjusted(
					lookup.requestedLatitude,
					lookup.requestedLongitude,
					info.latitude,
					info.longitude,
					info.location
				)
				: $msg.common.prompts.locationConfirm(info.latitude, info.longitude, info.location);
			const removeLink = await this.getCommandLink('alerts', 'remove');
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
				const snowflake   = generateSnowflake();
				const destination = await db.alertDestination.create({
					data: {
						snowflake,
						latitude: info.latitude,
						longitude: info.longitude,
						zoneId: info.zoneId,
						guildId,
						countyId: info.countyId,
						channelId: channel.id,
						autoCleanup,
						pingOnSevere,
						radarImageUrl: info.radarImageUrl
					},
					select: { snowflake: true }
				});

				this.eventBus.emit('alert-destinations:updated');

				await interaction.editReply({
					content: $msg.commands.alerts.created(channel.toString(), removeLink, destination.snowflake),
					components: []
				});
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
				reportError('Error creating alert destination', err);
				await interaction.editReply({ content: $msg.errors.unknown(), components: [] });
			}
		}
	}

	private async _handleRemoveSubcommand(interaction: ChatInputCommandInteraction) {
		const { guildId } = interaction;
		const snowflake   = interaction.options.getString('snowflake', true);

		GuildOnlyInvocationInNonGuildError.assert(guildId);
		InvalidSnowflakeError.assert(isValidSnowflake(snowflake));

		await interaction.deferReply();

		const exists = await db.alertDestination.exists({ snowflake, guildId });
		if (!exists) {
			await interaction.editReply($msg.commands.alerts.errors.destinationNotFound(snowflake));
			return;
		}

		await db.alertDestination.delete({ where: { snowflake } });
		await interaction.editReply($msg.commands.alerts.removed());

		this.eventBus.emit('alert-destinations:updated');
	}

	private async _handleListSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId!;

		await interaction.deferReply();

		const destinations = await db.alertDestination.findMany({
			select: {
				snowflake: true,
				latitude: true,
				longitude: true,
				channelId: true,
				autoCleanup: true,
				pingOnSevere: true
			},
			where: {
				guildId
			}
		});
		if (!destinations.length) {
			await interaction.editReply($msg.errors.noDestinationsForType('alert'));
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(Color.Primary)
			.setTitle($msg.commands.alerts.listTitle());

		for (const { snowflake, latitude, longitude, channelId, autoCleanup, pingOnSevere } of destinations) {
			const info    = await this.location.getInfoFromCoordinates(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${info.location} (${latitude}, ${longitude})`,
				value: [
					$msg.common.status.reportingTo(channel!.toString()),
					JSON.stringify({ snowflake, autoCleanup, pingOnSevere }, null, 4).toCodeBlock('json')
				].join('\n')
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
