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
export default class AutoRadarCommand extends BaseCommand {
	public constructor(
		private readonly location = inject(LocationService)
	) {
		super({
			data: new SlashCommandBuilder()
			.setName('auto-radar')
			.setDescription('Designates a channel to post an auto-updating radar image for a region')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
		const latitude  = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel   = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.autoRadarMessage.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, $msg.commands.autoRadar.errors.maxMessagesReached(), { max: maxCount });

		if (!this.location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply($msg.errors.invalidCoordinates());
		}

		await interaction.deferReply();

		const location = await this.location.getInfoFromCoordinates(latitude, longitude);
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
			content: $msg.commands.autoRadar.locationConfirmWithImage(latitude, longitude, location.location, location.radarImageUrl),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const guildId            = interaction.guildId!;
				const channelId          = channel.id;
				const snowflake          = generateSnowflake();
				const placeholderMessage = await channel.send({
					content: $msg.commands.autoRadar.placeholderMessage(location.location),
					flags: [MessageFlags.SuppressNotifications]
				});

				await db.autoRadarMessage.create({
					data: {
						snowflake,
						guildId,
						channelId,
						messageId: placeholderMessage.id,
						location: location.location,
						radarStation: location.radarStation,
						radarImageUrl: location.radarImageUrl
					}
				});

				await interaction.editReply({
					content: $msg.commands.autoRadar.created(channel.toString()),
					components: []
				});
			} else {
				await initialReply.delete();
			}
		} catch (err) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				await interaction.editReply({ content: $msg.errors.locationLookupHttpError(err.code, err.status), components: [] });
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ content: $msg.common.notices.promptTimedOut(), components: [] });
			} else {
				reportError('Error creating auto-radar destination', err);
				await interaction.editReply({ content: $msg.errors.unknown(), components: [] });
			}
		}
	}
}
