import { env } from '@env';
import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { LocationService } from '@services/location';
import { EventBusService } from '@services/event-bus';
import { or, and } from '@prisma/orm-postgres/orm-client';
import { toInstant, requireRecord } from '@database/values';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isValidSnowflake, generateSnowflake } from '@lib/snowflake';
import { resolveDestinationExpiration } from '../destination-expiration';
import {
	createErrorMessageComponent,
	createSuccessMessageComponent,
	createWarningMessageComponent
} from '@utils/components';
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
	MessageFlags,
	ButtonBuilder,
	ContainerBuilder,
	DiscordjsErrorCodes,
	PermissionFlagsBits,
	SlashCommandBuilder
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Add = 'add',
	Remove = 'remove',
	List = 'list',
}

export class AlertsCommand extends BaseCommand {
	public constructor(
		private readonly eventBus = inject(EventBusService),
		private readonly location = inject(LocationService),
	) {
		super({
			data: new SlashCommandBuilder()
				.setName('alerts')
				.setDescription('Alerts super command')
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand((sc) => sc
					.setName(Subcommands.Add)
					.setDescription('Designates a channel for posting weather alerts to')
					.addStringOption((o) => o
						.setName('latitude')
						.setDescription('The latitude of the area to check for active alerts')
						.setRequired(true),
					)
					.addStringOption((o) => o
						.setName('longitude')
						.setDescription('The longitude of the area to check for active alerts')
						.setRequired(true),
					)
					.addChannelOption((o) => o
						.setName('channel')
						.setDescription('The channel in which to send alerts to')
						.setRequired(true),
					)
					.addBooleanOption((o) => o
						.setName('auto-cleanup')
						.setDescription('Whether my messages should be deleted periodically (true by default)')
						.setRequired(false),
					)
					.addStringOption((o) => o
						.setName('expires-after')
						.setDescription('How long to check this location for alerts (never expires by default)')
						.addChoices([
							{ name: '24 hours', value: '24h' },
							{ name: '3 days', value: '3d' },
							{ name: '1 week', value: '1w' },
							{ name: '1 month', value: '1mo' },
						])
						.setRequired(false),
					),
				)
				.addSubcommand((sc) => sc
					.setName(Subcommands.Remove)
					.setDescription('Removes an alert reporting destination')
					.addStringOption((o) => o
						.setName('snowflake')
						.setDescription('The snowflake of the alert destination to delete')
						.setRequired(true),
					),
				)
				.addSubcommand((sc) => sc
					.setName(Subcommands.List)
					.setDescription('Lists all alert reporting destinations in the server'),
				),
			preconditions: [new CooldownPrecondition({ duration: '3s', global: true })],
		});

		this.configureSubcommands<Subcommands>({
			[Subcommands.Add]: [],
			[Subcommands.Remove]: [],
			[Subcommands.List]: [],
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.Add](interaction: ChatInputCommandInteraction) {
		const maxCount = env.get('MAX_ALERT_DESTINATIONS_PER_GUILD');
		const guildId = interaction.guildId;
		const latitude = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
		const autoCleanup = interaction.options.getBoolean('auto-cleanup') ?? true;
		const expiresAfter = interaction.options.getString('expires-after');

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.orm.public.AlertDestination.where((f) => f.guildId.eq(guildId))
			.where((f) => or(f.expiresAt.isNull(), f.expiresAt.gt(toInstant(new Date()))))
			.aggregate((a) => ({ count: a.count() }))
			.then((r) => r.count);
		MaxDestinationError.assert(
			existingCount < maxCount,
			$msg.alerts.command.errors.maxDestinationsReached(),
			{ max: maxCount },
		);

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			await interaction.reply($msg.shared.errors.invalidCoordinates());
			return;
		}

		await interaction.deferReply();

		try {
			const location = await this.location.resolveCoordinates(latitude, longitude);
			const exists = await db.orm.public.AlertDestination.where((f) =>
				and(
					f.latitude.eq(location.latitude),
					f.longitude.eq(location.longitude),
					f.channelId.eq(channel.id),
					or(f.expiresAt.isNull(), f.expiresAt.gt(toInstant(new Date()))),
				),
			)
				.first()
				.then((row) => row !== null);
			if (exists) {
				await interaction.editReply({
					components: [createWarningMessageComponent($msg.alerts.command.errors.destinationExists())],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			const locationPrompt = location.wasAdjusted
				? $msg.shared.prompts.locationConfirmAdjusted(
						location.requested.latitude,
						location.requested.longitude,
						location.latitude,
						location.longitude,
						location.name,
					)
				: $msg.shared.prompts.locationConfirm(location.latitude, location.longitude, location.name);
			const removeLink = await this.getCommandLink('alerts', 'remove');
			const container = new ContainerBuilder()
				.addTextDisplayComponents((t) => t.setContent(locationPrompt))
				.addActionRowComponents((a) => a
					.addComponents(
						new ButtonBuilder()
							.setCustomId('confirm')
							.setLabel($msg.shared.buttons.yes())
							.setStyle(ButtonStyle.Success),
					)
					.addComponents(
						new ButtonBuilder()
							.setCustomId('deny')
							.setLabel($msg.shared.buttons.no())
							.setStyle(ButtonStyle.Danger),
					),
				);

			const initialReply = await interaction.editReply({
				components: [container],
				flags: [MessageFlags.IsComponentsV2],
			});

			const confirmation = await initialReply.awaitMessageComponent({
				filter: (i) => i.user.id === interaction.user.id && ['confirm', 'deny'].includes(i.customId),
				time: 30_000,
			});
			await confirmation.deferUpdate();
			const { customId } = confirmation;
			if (customId === 'confirm') {
				const snowflake = generateSnowflake();
				const expiresAt = resolveDestinationExpiration(expiresAfter);
				const destination = await db.orm.public.AlertDestination.select('snowflake').create({
					snowflake: snowflake,
					latitude: location.latitude,
					longitude: location.longitude,
					zoneId: location.zoneId,
					guildId: guildId,
					countyId: location.countyId,
					channelId: channel.id,
					autoCleanup: autoCleanup,
					expiresAt: toInstant(expiresAt),
					radarImageUrl: location.radar.reflectivityImageUrl,
				});

				this.eventBus.emit('alert-destinations:updated');

				await interaction.editReply({
					components: [
						createSuccessMessageComponent(
							$msg.alerts.command.created(channel.toString(), removeLink, destination.snowflake),
						),
					],
					flags: MessageFlags.IsComponentsV2,
				});
			} else {
				await initialReply.delete();
			}
		} catch (err: unknown) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				if (err.code === 404) {
					await interaction.editReply({
						components: [createErrorMessageComponent($msg.shared.errors.locationNotFound())],
						flags: MessageFlags.IsComponentsV2,
					});
				} else {
					await interaction.editReply({
						components: [
							createErrorMessageComponent($msg.shared.errors.locationLookupHttpError(err.code, err.status)),
						],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({
					components: [createWarningMessageComponent($msg.shared.notices.promptTimedOut())],
					flags: MessageFlags.IsComponentsV2,
				});
			} else {
				reportError('Error creating alert destination', err);
				await interaction.editReply({
					components: [createErrorMessageComponent($msg.shared.errors.unknown())],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		}
	}

	public async [Subcommands.Remove](interaction: ChatInputCommandInteraction) {
		const { guildId } = interaction;
		const snowflake = interaction.options.getString('snowflake', true);

		GuildOnlyInvocationInNonGuildError.assert(guildId);
		InvalidSnowflakeError.assert(isValidSnowflake(snowflake));

		await interaction.deferReply();

		const exists = await db.orm.public.AlertDestination
			.where((f) => and(f.snowflake.eq(snowflake), f.guildId.eq(guildId)))
				.first()
				.then((row) => row !== null);
		if (!exists) {
			await interaction.editReply($msg.alerts.command.errors.destinationNotFound(snowflake));
			return;
		}

		await db.orm.public.AlertDestination.where((f) => f.snowflake.eq(snowflake))
			.delete()
			.then(requireRecord);
		await interaction.editReply($msg.alerts.command.removed());

		this.eventBus.emit('alert-destinations:updated');
	}

	public async [Subcommands.List](interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId!;

		await interaction.deferReply();

		const destinations = await db.orm.public.AlertDestination.where((f) =>
			and(f.guildId.eq(guildId), or(f.expiresAt.isNull(), f.expiresAt.gt(toInstant(new Date())))))
				.select('snowflake', 'latitude', 'longitude', 'channelId', 'autoCleanup', 'expiresAt')
				.all();
		if (!destinations.length) {
			await interaction.editReply($msg.shared.errors.noDestinationsForType('alert'));
			return;
		}

		const embed = new EmbedBuilder().setColor(Color.Primary).setTitle($msg.alerts.command.listTitle());

		for (const { snowflake, latitude, longitude, channelId, autoCleanup, expiresAt } of destinations) {
			const location = await this.location.getLocation(latitude, longitude);
			const channel = await interaction.client.channels.fetch(channelId);
			embed.addFields({
				name: `${location.name} (${latitude}, ${longitude})`,
				value: [
					$msg.shared.status.reportingTo(channel!.toString()),
					JSON.stringify({ snowflake, autoCleanup, expiresAt }, null, 4).toCodeBlock('json'),
				].join('\n'),
			});
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
