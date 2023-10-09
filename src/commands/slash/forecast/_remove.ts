import { logger } from '@logger';
import { database } from '@data';
import { ForecastReportingMessages } from '@messages';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function removeSubcommand(interaction: ChatInputCommandInteraction): Promise<any> {
	const { guild, options } = interaction;
	if (!guild) {
		return;
	}

	const snowflake = options.getString('snowflake', true).trim();
	const exists    = await database.forecastDestination.exists({ snowflake });
	if (!exists) {
		return await interaction.reply(ForecastReportingMessages.destinationNonexistent(interaction));
	}

	try {
		const res = await database.forecastDestination.delete({ where: { snowflake } });

		await interaction.reply(ForecastReportingMessages.destinationRemoved(interaction, res.channelId));
	} catch (err: unknown) {
		logger.error('Unable to remove forecast reporting', { err });

		await interaction.reply(ForecastReportingMessages.destinationRemoveFailed(interaction));
	}
}
