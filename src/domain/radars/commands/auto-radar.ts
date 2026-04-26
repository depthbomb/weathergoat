import { env } from '@env';
import { db } from '@database';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { generateSnowflake } from '@lib/snowflake';
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
	createMessageComponent,
	createErrorMessageComponent,
	createSuccessMessageComponent,
	createWarningMessageComponent
} from '@utils/components';
import {
	ButtonStyle,
	ChannelType,
	MessageFlags,
	ButtonBuilder,
	ContainerBuilder,
	DiscordjsErrorCodes,
	PermissionFlagsBits,
	SlashCommandBuilder,
	SeparatorSpacingSize
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

type RadarType = 'reflectivity' | 'base-velocity' | 'both';

export class AutoRadarCommand extends BaseCommand {
	public constructor(
		private readonly location = inject(LocationService)
	) {
		super({
			data: new SlashCommandBuilder()
				.setName('auto-radar')
				.setDescription('Designates a channel to post an auto-updating radar image for a region')
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addStringOption(o => o
					.setName('radar-type')
					.addChoices([
						{ name: 'Reflectivity (recommended)', value: 'reflectivity' },
						{ name: 'Base Velocity', value: 'base-velocity' },
						{ name: 'Both', value: 'both' },
					])
					.setDescription('The type of radar image')
					.setRequired(true)
				)
				.addStringOption(o => o.setName('latitude').setDescription('The latitude of the area').setRequired(true))
				.addStringOption(o => o.setName('longitude').setDescription('The longitude of the area').setRequired(true))
				.addChannelOption(o => o.setName('channel').setDescription('The channel to host the auto-updating radar image').setRequired(true)),
			preconditions: [
				new CooldownPrecondition({ duration: '5s', global: true })
			]
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		const maxCount  = env.get('MAX_RADAR_MESSAGES_PER_GUILD');
		const guildId   = interaction.guildId;
		const radarType = interaction.options.getString('radar-type', true).trim() as RadarType;
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.autoRadarMessage.countByGuild(guildId);

		MaxDestinationError.assert(existingCount < maxCount, $msg.radar.auto.errors.maxMessagesReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			await interaction.reply($msg.shared.errors.invalidCoordinates());
			return;
		}

		await interaction.deferReply();

		try {
			const location = await this.location.resolveCoordinates(latitude, longitude);
			const locationPrompt = location.wasAdjusted
				? $msg.shared.prompts.locationConfirmAdjustedWithImage(
					location.requested.latitude,
					location.requested.longitude,
					location.latitude,
					location.longitude,
					location.name
				) : $msg.radar.auto.locationConfirmWithImage(
					location.latitude,
					location.longitude,
					location.name
				);

			const container = new ContainerBuilder()
				.addTextDisplayComponents(t => t.setContent(locationPrompt))
				.addMediaGalleryComponents(g => g
					.addItems(i => i.setURL(location.radar.reflectivityImageUrl))
					.addItems(i => i.setURL(location.radar.velocityImageUrl))
				)
				.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Large))
				.addActionRowComponents(a => a
					.addComponents(
						new ButtonBuilder()
							.setCustomId('confirm')
							.setLabel($msg.shared.buttons.yes())
							.setStyle(ButtonStyle.Success)
					)
					.addComponents(
						new ButtonBuilder()
							.setCustomId('deny')
							.setLabel($msg.shared.buttons.no())
							.setStyle(ButtonStyle.Danger)
					)
				);
			const initialReply = await interaction.editReply({
				components: [container],
				flags: [MessageFlags.IsComponentsV2]
			});

			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30_000 });
			if (customId === 'confirm') {
				const guildId            = interaction.guildId!;
				const channelId          = channel.id;
				const snowflake          = generateSnowflake();
				const placeholderMessage = await channel.send({
					components: [createMessageComponent($msg.radar.auto.placeholderMessage(location.name))],
					flags: [
						MessageFlags.SuppressNotifications,
						MessageFlags.IsComponentsV2
					]
				});

				await db.autoRadarMessage.create({
					data: {
						snowflake,
						guildId,
						channelId,
						messageId: placeholderMessage.id,
						location: location.name,
						radarStation: location.radar.station,
						radarImageUrl: location.radar.reflectivityImageUrl,
						velocityRadarImageUrl: location.radar.velocityImageUrl,
						showReflectivity: radarType === 'both' || radarType === 'reflectivity',
						showVelocity: radarType === 'both' || radarType === 'base-velocity',
					}
				});

				await interaction.editReply({
					components: [createSuccessMessageComponent($msg.radar.auto.created(channel.toString()))]
				});
			} else {
				await initialReply.delete();
			}
		} catch (err) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				if (err.code === 404) {
					await interaction.editReply({
						components: [createErrorMessageComponent($msg.shared.errors.locationNotFound())]
					});
				} else {
					await interaction.editReply({
						components: [createErrorMessageComponent($msg.shared.errors.locationLookupHttpError(err.code, err.status))]
					});
				}
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({
					components: [createWarningMessageComponent($msg.shared.notices.promptTimedOut())]
				});
			} else {
				reportError('Error creating auto-radar destination', err);
				await interaction.editReply({
					components: [createErrorMessageComponent($msg.shared.errors.unknown())]
				});
			}
		}
	}
}
