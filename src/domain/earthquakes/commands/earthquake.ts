import { env } from '@env';
import { db } from '@database';
import { Color } from '@constants';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { GeocodingService } from '@services/geocoding';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { isValidSnowflake, generateSnowflake } from '@lib/snowflake';
import { HTTPRequestError as SharedHTTPRequestError } from '@services/http';
import { buildEarthquakeEmbed, buildEarthquakeListEmbeds } from '../presentation';
import { HTTPRequestError, isDiscordJSError, isWeatherGoatError, GuildOnlyInvocationInNonGuildError } from '@errors';
import {
	EarthquakeService,
	earthquakeDistanceKm,
	EarthquakeUnavailableError,
	EarthquakeStaleResponseError,
	EarthquakeInvalidResponseError
} from '@services/earthquakes';
import {
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	ButtonBuilder,
	ActionRowBuilder,
	DiscordjsErrorCodes,
	PermissionFlagsBits,
	SlashCommandBuilder
} from 'discord.js';
import type { EarthquakeCollection } from '@models/Earthquake';
import type { GuildTextBasedChannel, ChatInputCommandInteraction, InteractionEditReplyOptions } from 'discord.js';

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 2_000;
const MIN_MAGNITUDE = -1;
const MAX_MAGNITUDE = 10;
const MIN_HOURS = 1;
const MAX_HOURS = 720;
const MAX_RESULTS = 10;
const DEFAULT_HOURS = 24;
const DEFAULT_RESULTS = 5;
const DEFAULT_RADIUS_KM = 100;
const DEFAULT_MIN_MAGNITUDE = 0;
const DEFAULT_SUBSCRIPTION_MAGNITUDE = 3;
const ALLOWED_MENTIONS = Object.freeze({ parse: [] as never[] });

const enum Subcommands {
	Recent        = 'recent',
	Nearby        = 'nearby',
	Detail        = 'detail',
	Subscribe     = 'subscribe',
	Subscriptions = 'subscriptions',
	Unsubscribe   = 'unsubscribe'
}

type LocationResult = {
	name: string;
	latitude: number;
	longitude: number;
	license: string | null;
};

class BotChannelPermissionsError extends Error {}

export function earthquakeProviderErrorMessage(error: unknown, detailLookup = false) {
	if (error instanceof EarthquakeStaleResponseError) {
		return 'USGS returned stale earthquake data. Please try again later.';
	}

	if (error instanceof EarthquakeInvalidResponseError) {
		return 'USGS returned earthquake data that could not be safely read. Please try again later.';
	}

	if (error instanceof EarthquakeUnavailableError) {
		if (detailLookup && (error.status === 204 || error.status === 404)) {
			return 'No USGS earthquake was found with that event ID.';
		}

		return 'USGS earthquake data is currently unavailable. Please try again later.';
	}

	if (error instanceof RangeError) {
		return 'The earthquake request contains an invalid value.';
	}

	return null;
}

function editReply(content: string): InteractionEditReplyOptions {
	return { content, allowedMentions: ALLOWED_MENTIONS };
}

function searchOptions(interaction: ChatInputCommandInteraction) {
	const hours = interaction.options.getInteger('hours') ?? DEFAULT_HOURS;
	const limit = interaction.options.getInteger('results') ?? DEFAULT_RESULTS;
	const minMagnitude = interaction.options.getNumber('minimum-magnitude') ?? DEFAULT_MIN_MAGNITUDE;

	return {
		startTime: new Date(Date.now() - hours * 60 * 60_000),
		minMagnitude,
		limit
	};
}

function addSearchOptions<T extends { addIntegerOption: Function; addNumberOption: Function }>(subcommand: T) {
	return subcommand
		.addIntegerOption((option: any) => option
			.setName('hours')
			.setDescription('How far back to search (24 by default)')
			.setMinValue(MIN_HOURS)
			.setMaxValue(MAX_HOURS)
		)
		.addNumberOption((option: any) => option
			.setName('minimum-magnitude')
			.setDescription('Minimum magnitude (0 by default)')
			.setMinValue(MIN_MAGNITUDE)
			.setMaxValue(MAX_MAGNITUDE)
		)
		.addIntegerOption((option: any) => option
			.setName('results')
			.setDescription('Maximum results (5 by default)')
			.setMinValue(1)
			.setMaxValue(MAX_RESULTS)
		);
}

function resolveLocation(raw: { displayName: string; latitude: string; longitude: string; license?: string }): LocationResult | null {
	const latitude = Number(raw.latitude);
	const longitude = Number(raw.longitude);
	if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
		|| !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
		return null;
	}

	return {
		name: raw.displayName.slice(0, 512),
		latitude,
		longitude,
		license: raw.license?.slice(0, 512) ?? null
	};
}

export class EarthquakeCommand extends BaseCommand {
	public constructor(
		private readonly earthquakes = inject(EarthquakeService),
		private readonly geocoding = inject(GeocodingService)
	) {
		super({
			data: new SlashCommandBuilder()
				.setName('earthquake')
				.setDescription('Global USGS earthquake lookups and server subscriptions')
				.addSubcommand(subcommand => addSearchOptions(subcommand
					.setName(Subcommands.Recent)
					.setDescription('Show recent earthquakes worldwide')
				))
				.addSubcommand(subcommand => addSearchOptions(subcommand
					.setName(Subcommands.Nearby)
					.setDescription('Find recent earthquakes near a global location')
					.addStringOption(option => option
						.setName('location')
						.setDescription('City, region, postal code, or other global location')
						.setRequired(true)
					)
					.addNumberOption(option => option
						.setName('radius')
						.setDescription('Search radius in kilometers (100 by default)')
						.setMinValue(MIN_RADIUS_KM)
						.setMaxValue(MAX_RADIUS_KM)
					)
				))
				.addSubcommand(subcommand => subcommand
					.setName(Subcommands.Detail)
					.setDescription('Show details for a USGS earthquake event')
					.addStringOption(option => option
						.setName('event-id')
						.setDescription('USGS event ID')
						.setMaxLength(128)
						.setRequired(true)
					)
				)
				.addSubcommand(subcommand => subcommand
					.setName(Subcommands.Subscribe)
					.setDescription('Subscribe a server text channel to nearby earthquakes')
					.addStringOption(option => option
						.setName('location')
						.setDescription('City, region, postal code, or other global location')
						.setRequired(true)
					)
					.addChannelOption(option => option
						.setName('channel')
						.setDescription('Server text channel that will receive notifications')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
					)
					.addNumberOption(option => option
						.setName('radius')
						.setDescription('Notification radius in kilometers (100 by default)')
						.setMinValue(MIN_RADIUS_KM)
						.setMaxValue(MAX_RADIUS_KM)
					)
					.addNumberOption(option => option
						.setName('minimum-magnitude')
						.setDescription('Minimum magnitude (3 by default)')
						.setMinValue(MIN_MAGNITUDE)
						.setMaxValue(MAX_MAGNITUDE)
					)
				)
				.addSubcommand(subcommand => subcommand
					.setName(Subcommands.Subscriptions)
					.setDescription('List this server’s earthquake subscriptions')
				)
				.addSubcommand(subcommand => subcommand
					.setName(Subcommands.Unsubscribe)
					.setDescription('Remove one of this server’s earthquake subscriptions')
					.addStringOption(option => option
						.setName('snowflake')
						.setDescription('Subscription ID shown by /earthquake subscriptions')
						.setRequired(true)
					)
				),
			preconditions: [new CooldownPrecondition({ duration: '3s', global: true })]
		});

		this.configureSubcommands<Subcommands>({
			[Subcommands.Recent]:        [],
			[Subcommands.Nearby]:        [],
			[Subcommands.Detail]:        [],
			[Subcommands.Subscribe]:     [],
			[Subcommands.Subscriptions]: [],
			[Subcommands.Unsubscribe]:   []
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.Recent](interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		try {
			const collection = await this.earthquakes.getRecent(searchOptions(interaction));

			await this.replyWithCollection(interaction, collection, 'No earthquakes matched that global search.');
		} catch (error) {
			await this.replyWithProviderError(interaction, error, false, 'Unable to retrieve recent earthquakes');
		}
	}

	public async [Subcommands.Nearby](interaction: ChatInputCommandInteraction) {
		const query = interaction.options.getString('location', true).trim();
		const radiusKm = interaction.options.getNumber('radius') ?? DEFAULT_RADIUS_KM;

		await interaction.deferReply();

		try {
			const location = await this.lookupLocation(query);
			if (!location) {
				await interaction.editReply(editReply('No global location matched that search.'));
				return;
			}

			const collection = await this.earthquakes.getNearby({
				...searchOptions(interaction),
				latitude: location.latitude,
				longitude: location.longitude,
				radiusKm
			});
			const distances = new Map(collection.events.map(event => [
				event.id,
				earthquakeDistanceKm({
					latitude: location.latitude,
					longitude: location.longitude,
					depthKm: 0
				}, event.coordinates)
			]));

			await this.replyWithCollection(
				interaction,
				collection,
				`No earthquakes matched ${location.name} within ${radiusKm} km.`,
				distances,
				`Earthquakes near ${location.name}`
			);
		} catch (error) {
			await this.replyWithProviderError(interaction, error, false, 'Unable to search for nearby earthquakes');
		}
	}

	public async [Subcommands.Detail](interaction: ChatInputCommandInteraction) {
		const eventId = interaction.options.getString('event-id', true).trim();

		await interaction.deferReply();

		try {
			const event = await this.earthquakes.getDetail(eventId);

			await interaction.editReply({ embeds: [buildEarthquakeEmbed(event)], allowedMentions: ALLOWED_MENTIONS });
		} catch (error) {
			await this.replyWithProviderError(interaction, error, true, 'Unable to retrieve earthquake details');
		}
	}

	public async [Subcommands.Subscribe](interaction: ChatInputCommandInteraction) {
		this.assertSubscriptionAccess(interaction);

		const guildId = interaction.guildId!;
		const query = interaction.options.getString('location', true).trim();
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]) as GuildTextBasedChannel;
		const radiusKm = interaction.options.getNumber('radius') ?? DEFAULT_RADIUS_KM;
		const minMagnitude = interaction.options.getNumber('minimum-magnitude') ?? DEFAULT_SUBSCRIPTION_MAGNITUDE;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			this.assertBotChannelPermissions(interaction, channel);

			const maximum = env.get('MAX_EARTHQUAKE_SUBSCRIPTIONS_PER_GUILD');
			const count = await db.earthquakeSubscription.count({ where: { guildId } });
			if (count >= maximum) {
				await interaction.editReply(editReply(`This server already has the maximum of ${maximum} earthquake subscriptions.`));
				return;
			}

			const location = await this.lookupLocation(query);
			if (!location) {
				await interaction.editReply(editReply('No global location matched that search.'));
				return;
			}

			const existing = await db.earthquakeSubscription.findFirst({
				where: {
					guildId,
					channelId: channel.id,
					latitude: location.latitude,
					longitude: location.longitude,
					radiusKm,
					minMagnitude
				}
			});
			if (existing) {
				await interaction.editReply(editReply(`That subscription already exists (ID: ${existing.snowflake}).`));
				return;
			}

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('earthquake-subscribe-confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('earthquake-subscribe-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
			);
			const prompt = [
				'Confirm this earthquake subscription:',
				`Location: **${location.name.replaceAll('*', '\\*')}** (${location.latitude}, ${location.longitude})`,
				`Radius: **${radiusKm} km**`,
				`Minimum magnitude: **${minMagnitude}**`,
				`Destination: ${channel}`,
				'Sources: location by Nominatim/OpenStreetMap; earthquake catalog by U.S. Geological Survey (USGS).',
				'Notifications are post-detection catalog updates, not earthquake prediction or early warning.'
			].join('\n');
			const reply = await interaction.editReply({ content: prompt, components: [row], allowedMentions: ALLOWED_MENTIONS });
			const confirmation = await reply.awaitMessageComponent({
				filter: component => component.user.id === interaction.user.id,
				time: 30_000
			});

			await confirmation.deferUpdate();

			if (confirmation.customId !== 'earthquake-subscribe-confirm') {
				await interaction.editReply({ ...editReply('Earthquake subscription cancelled.'), components: [] });
				return;
			}

			const subscription = await db.earthquakeSubscription.create({
				data: {
					snowflake: generateSnowflake(),
					guildId,
					channelId: channel.id,
					locationName: location.name,
					latitude: location.latitude,
					longitude: location.longitude,
					radiusKm,
					minMagnitude
				},
				select: { snowflake: true }
			});

			await interaction.editReply({
				...editReply(`Earthquake subscription created for ${channel}. ID: ${subscription.snowflake}`),
				components: []
			});
		} catch (error) {
			if (isDiscordJSError(error, DiscordjsErrorCodes.InteractionCollectorError)) {
				await interaction.editReply({ ...editReply('The confirmation timed out; no subscription was created.'), components: [] });
				return;
			}

			await this.replyWithProviderError(interaction, error, false, 'Unable to create earthquake subscription');
		}
	}

	public async [Subcommands.Subscriptions](interaction: ChatInputCommandInteraction) {
		this.assertSubscriptionAccess(interaction);
		const guildId = interaction.guildId!;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const subscriptions = await db.earthquakeSubscription.findMany({
				where: { guildId },
				orderBy: { createdAt: 'asc' },
				take: 100
			});
			if (!subscriptions.length) {
				await interaction.editReply(editReply('This server has no earthquake subscriptions.'));
				return;
			}

			const embeds = [];
			for (let offset = 0; offset < subscriptions.length; offset += 10) {
				const description = subscriptions.slice(offset, offset + 10).map(subscription => [
					`**${subscription.locationName.slice(0, 256)}**`,
					`<\#${subscription.channelId}> • ${subscription.radiusKm} km • M${subscription.minMagnitude}+`,
					`ID: \`${subscription.snowflake}\``
				].join('\n')).join('\n\n');
				embeds.push(new EmbedBuilder()
					.setColor(Color.Primary)
					.setTitle(offset === 0 ? 'Earthquake subscriptions' : 'Earthquake subscriptions (continued)')
					.setDescription(description.slice(0, 4_096))
					.setFooter({ text: 'Earthquake source: U.S. Geological Survey (USGS)' })
				);
			}

			await interaction.editReply({ embeds: embeds.slice(0, 10), allowedMentions: ALLOWED_MENTIONS });
		} catch (error) {
			reportError('Unable to list earthquake subscriptions', error, { guildId });
			await interaction.editReply(editReply('Unable to list earthquake subscriptions right now.'));
		}
	}

	public async [Subcommands.Unsubscribe](interaction: ChatInputCommandInteraction) {
		this.assertSubscriptionAccess(interaction);
		const guildId = interaction.guildId!;
		const snowflake = interaction.options.getString('snowflake', true).trim();

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!isValidSnowflake(snowflake)) {
			await interaction.editReply(editReply('That earthquake subscription ID is invalid.'));
			return;
		}

		try {
			const deleted = await db.earthquakeSubscription.deleteMany({ where: { guildId, snowflake } });
			if (deleted.count === 0) {
				await interaction.editReply(editReply('No earthquake subscription with that ID exists in this server.'));
				return;
			}

			await interaction.editReply(editReply('Earthquake subscription removed.'));
		} catch (error) {
			reportError('Unable to remove earthquake subscription', error, { guildId, snowflake });
			await interaction.editReply(editReply('Unable to remove that earthquake subscription right now.'));
		}
	}

	private async lookupLocation(query: string) {
		if (!query.length) {
			return null;
		}

		const results = await this.geocoding.queryGlobalLocationInfo(query);

		return results.length ? resolveLocation(results[0]) : null;
	}

	private async replyWithCollection(
		interaction: ChatInputCommandInteraction,
		collection: EarthquakeCollection,
		emptyMessage: string,
		distances?: Map<string, number>,
		heading?: string
	) {
		if (!collection.events.length) {
			await interaction.editReply(editReply(emptyMessage));
			return;
		}

		await interaction.editReply({
			content: heading,
			embeds: buildEarthquakeListEmbeds(collection.events, distances),
			allowedMentions: ALLOWED_MENTIONS
		});
	}

	private async replyWithProviderError(
		interaction: ChatInputCommandInteraction,
		error: unknown,
		detailLookup: boolean,
		logMessage: string
	) {
		const providerMessage = earthquakeProviderErrorMessage(error, detailLookup);
		if (providerMessage) {
			await interaction.editReply(editReply(providerMessage));
			return;
		}

		if (isWeatherGoatError(error, HTTPRequestError)) {
			await interaction.editReply(editReply('The location service is currently unavailable. Please try again later.'));
			return;
		}
		if (error instanceof SharedHTTPRequestError) {
			await interaction.editReply(editReply('An external data service is currently unavailable. Please try again later.'));
			return;
		}
		if (error instanceof BotChannelPermissionsError) {
			await interaction.editReply(editReply(error.message));
			return;
		}

		reportError(logMessage, error);
		await interaction.editReply(editReply('The earthquake request could not be completed. Please try again later.'));
	}

	private assertSubscriptionAccess(interaction: ChatInputCommandInteraction) {
		GuildOnlyInvocationInNonGuildError.assert(interaction.guildId);
		this.assertPermissions(interaction, PermissionFlagsBits.ManageGuild);
	}

	private assertBotChannelPermissions(interaction: ChatInputCommandInteraction, channel: GuildTextBasedChannel) {
		const botMember = interaction.guild?.members.me;
		const required = [
			PermissionFlagsBits.ViewChannel,
			PermissionFlagsBits.SendMessages,
			PermissionFlagsBits.EmbedLinks,
			PermissionFlagsBits.ReadMessageHistory
		];
		const missing = botMember ? channel.permissionsFor(botMember).missing(required) : required;
		if (missing.length) {
			throw new BotChannelPermissionsError(`I need View Channel, Send Messages, Embed Links, and Read Message History in ${channel} before it can receive earthquake notifications.`);
		}
	}
}
