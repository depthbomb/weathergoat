import { logger } from '@logger';
import { database } from '@data';
import { getOrThrow } from '@config';
import { getCoordinateInfo } from '@lib/location';
import { ForecastReportingMessages } from '@messages';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function forecastReportingSubcommand(interaction: ChatInputCommandInteraction): Promise<any> {
	const { guild, options } = interaction;
	if (!guild) {
		return;
	}

	const currentCount = await database.forecastDestination.count({ where: { guildId: guild.id } });
	if (currentCount >= getOrThrow<number>('limits.forecastDestinations')) {
		return await interaction.reply(ForecastReportingMessages.limitReached(interaction));
	}

	const latitude         = options.getNumber('latitude', true);
	const longitude        = options.getNumber('longitude', true);
	const reportingChannel = options.getChannel('channel', true);
	const cleanup          = options.getBoolean('cleanup') ?? true;

	try {
		const { radarImageUrl } = await getCoordinateInfo(latitude, longitude);
		const res = await database.forecastDestination.create({
			data: {
				latitude,
				longitude,
				guildId:     guild.id,
				channelId:   reportingChannel.id,
				autoCleanup: cleanup,
				radarImageUrl
			}
		})

		await interaction.reply(ForecastReportingMessages.destinationCreated(interaction, cleanup, res.snowflake!));
	} catch (err: unknown) {
		logger.error('Error adding forecast destination', { err });

		await interaction.reply(ForecastReportingMessages.destinationCreateFailed(interaction));
	}
}
