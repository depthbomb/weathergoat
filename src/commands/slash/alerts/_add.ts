import { logger } from '@logger';
import { database } from '@data';
import { getOrThrow } from '@config';
import { getCoordinateInfo } from '@lib/location';
import { GenericMessages, AlertReportingMessages } from '@messages';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function addSubcommand(interaction: ChatInputCommandInteraction): Promise<any> {
	const { guild, options } = interaction;
	if (!guild) {
		return;
	}

	const currentCount = await database.alertDestination.count({
		where: {
			guildId: guild.id
		}
	});
	if (currentCount >= getOrThrow<number>('limits.alertDestinations')) {
		return await interaction.reply(AlertReportingMessages.limitReached(interaction));
	}

	const latitude         = options.getNumber('latitude', true);
	const longitude        = options.getNumber('longitude', true);
	const reportingChannel = options.getChannel('channel', true);
	const cleanup          = options.getBoolean('cleanup') ?? true;
	const channel          = await guild.channels.fetch(reportingChannel.id);
	if (!channel) {
		return await interaction.reply(GenericMessages.nonexistentChannel(interaction));
	}

	const recordExists = await database.alertDestination.exists({
		AND: [
			{ latitude:  { equals: latitude } },
			{ longitude: { equals: longitude } },
			{ channelId: { equals: channel.id } },
		]
	});
	if (recordExists) {
		return await interaction.reply(AlertReportingMessages.destinationExists(interaction, channel.id));
	}

	try {
		const coordinateInfo = await getCoordinateInfo(latitude, longitude);
		const res = await database.alertDestination.create({
			data: {
				latitude,
				longitude,
				zoneId:        coordinateInfo.zoneId,
				countyId:      coordinateInfo.countyId,
				guildId:       guild.id,
				channelId:     channel.id,
				autoCleanup:   cleanup,
				radarImageUrl: coordinateInfo.radarImageUrl,
			}
		});

		await interaction.reply(AlertReportingMessages.destinationCreated(interaction, res.autoCleanup, res.snowflake!));
	} catch (err: unknown) {
		logger.error('Error creating alert destination', { err });

		await interaction.reply(AlertReportingMessages.destinationCreateFailed(interaction));
	}
}
