import { db } from '@db';
import { _ } from '@i18n';
import { Color } from '@constants';
import { tokens } from '@container';
import { BaseCommand } from '@commands';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isValidSnowflake, generateSnowflake } from '@snowflake';
import { isDiscordJSError, isWeatherGoatError, MaxDestinationError, GuildOnlyInvocationInNonGuildError } from '@errors';
import {
	messageLink,
	ChannelType,
	ButtonStyle,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	DiscordjsErrorCodes
} from 'discord.js';
import type { Container } from '@container';
import type { HTTPRequestError } from '@errors';
import type { ILocationService } from '@services/location';
import type { GuildTextBasedChannel, ChatInputCommandInteraction } from 'discord.js';

export default class AutoRadarCommand extends BaseCommand {
	private readonly _location: ILocationService;

	public constructor(container: Container) {
		super({
			data: new SlashCommandBuilder()
			.setName('auto-radar')
			.setDescription('Auto radar super command')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addSubcommand(sc => sc
				.setName('add')
				.setDescription('Designates a channel to post an auto-updating radar image for a region')
				.addStringOption(o => o
					.setName('latitude')
					.setDescription('The latitude of the area')
					.setRequired(true)
				)
				.addStringOption(o => o
					.setName('longitude')
					.setDescription('The longitude of the area')
					.setRequired(true)
				)
				.addChannelOption(o => o
					.setName('channel')
					.setDescription('The channel to host the auto-updating radar image')
					.setRequired(true)
				)
			)
			.addSubcommand(sc => sc
				.setName('list')
				.setDescription('Lists all auto-updating radar messages in this server')
			)
			.addSubcommand(sc => sc
				.setName('remove')
				.setDescription('Designates a channel to post an auto-updating radar image for a region')
				.addStringOption(o => o
					.setName('snowflake')
					.setDescription('The snowflake of the radar message to remove')
					.setRequired(true)
				)
			),
			preconditions: [
				new CooldownPrecondition({ duration: '5s', global: true })
			]
		});

		this._location = container.resolve(tokens.location);

		this.createSubcommandMap<'add' | 'remove' | 'list'>({
			add: { handler: this._handleAddSubcommand },
			remove: { handler: this._handleRemoveSubcommand },
			list: { handler: this._handleListSubcommand },
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async _handleAddSubcommand(interaction: ChatInputCommandInteraction) {
		const maxCount = process.env.MAX_RADAR_CHANNELS_PER_GUILD;
		const guildId = interaction.guildId;
		const latitude = interaction.options.getString('latitude', true).trim();
		const longitude = interaction.options.getString('longitude', true).trim();
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

		GuildOnlyInvocationInNonGuildError.assert(guildId);

		const existingCount = await db.autoRadarMessage.countByGuild(guildId);
		MaxDestinationError.assert(existingCount < maxCount, _('commands.autoRadar.err.maxDestinationsReached'), { max: maxCount });

		if (!this._location.isValidCoordinates(latitude, longitude)) {
			return interaction.reply(_('common.err.invalidLatOrLon'));
		}

		await interaction.deferReply();

		const location = await this._location.getInfoFromCoordinates(latitude, longitude);
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
			content: _('commands.autoRadar.coordLocationAskConfirmation', { latitude, longitude, location }),
			components: [row]
		});

		try {
			const { customId } = await initialReply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 10_000 });
			if (customId === 'confirm') {
				const guildId = interaction.guildId!;
				const channelId = channel.id;
				const snowflake = generateSnowflake().toString();
				const { id } = await db.autoRadarMessage.create({
					data: {
						snowflake,
						guildId,
						channelId,
						location: location.location,
						radarStation: location.radarStation,
						radarImageUrl: location.radarImageUrl
					}
				});

				await interaction.editReply({
					content: _('commands.autoRadar.destCreated', { channel, id }),
					components: []
				});
			} else {
				await initialReply.delete();
			}
		} catch (err) {
			if (isWeatherGoatError<HTTPRequestError>(err)) {
				return interaction.editReply({ content: _('common.err.locationQueryHttpError', { err }), components: [] });
			} else if (isDiscordJSError(err, DiscordjsErrorCodes.InteractionCollectorError)) {
				return interaction.editReply({ content: _('common.promptTimedOut'), components: [] });
			}

			await interaction.editReply({ content: _('common.err.unknown'), components: [] });
		}
	}

	public async _handleRemoveSubcommand(interaction: ChatInputCommandInteraction) {
		const snowflake = interaction.options.getString('snowflake', true);
		if (!isValidSnowflake(snowflake)) {
			return interaction.reply(_('common.err.invalidSnowflake', { snowflake }));
		}

		await interaction.deferReply();

		const radarMessage = await db.autoRadarMessage.findFirst({ where: { snowflake } });
		if (!radarMessage) {
			return interaction.editReply(_('commands.autoRadar.err.noMessageBySnowflake', { snowflake }));
		}

		const { channelId, messageId } = radarMessage;
		if (messageId) {
			const channel = await interaction.guild!.channels.fetch(channelId) as GuildTextBasedChannel;
			const message = await channel?.messages.fetch(messageId);
			await message?.delete();
		}

		await db.autoRadarMessage.delete({ where: { snowflake } });
		await interaction.editReply(_('commands.autoRadar.deleteSuccess'));
	}

	public async _handleListSubcommand(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId!;

		await interaction.deferReply();

		const messages = await db.autoRadarMessage.findMany({
			select: {
				id: true,
				location: true,
				channelId: true,
				messageId: true,
				radarStation: true,
				radarImageUrl: true
			},
			where: {
				guildId
			}
		});
		if (!messages.length) {
			return interaction.editReply(_('commands.autoRadar.err.noMessages'));
		}

		const embed = new EmbedBuilder()
			.setColor(Color.Primary)
			.setTitle(_('commands.autoRadar.listEmbedTitle'));

		for (const { id, location, channelId, messageId, radarStation, radarImageUrl } of messages) {
			if (messageId) {
				const link = messageLink(channelId, messageId, guildId);
				embed.addFields({
					name: `${location} (${radarStation})`,
					value: [
						`- Radar Image: ${radarImageUrl}`,
						`- Message: ${link}`,
						`- Snowflake: \`${id}\``
					].join('\n')
				});
			} else {
				embed.addFields({
					name: `${location} (${radarStation})`,
					value: [
						`- Radar Image: ${radarImageUrl}`,
						`- Message: _Not sent yet_`,
						`- Snowflake: \`${id}\``
					].join('\n')
				});
			}
		}

		await interaction.editReply({ embeds: [embed] });
	}
}
