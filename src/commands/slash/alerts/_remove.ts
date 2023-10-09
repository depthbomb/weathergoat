import { logger } from '@logger';
import { database } from '@data';
import { AlertReportingMessages } from '@messages';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function removeSubcommand(interaction: ChatInputCommandInteraction): Promise<any> {
	const { guild, options } = interaction;
	if (!guild) {
		return;
	}

	const snowflake = options.getString('snowflake', true).trim();
	const exists    = await database.alertDestination.exists({ snowflake });
	if (!exists) {
		return await interaction.reply(AlertReportingMessages.destinationNonexistent(interaction));
	}

	try {
		const res = await database.alertDestination.delete({ where: { snowflake } });

		await interaction.reply(AlertReportingMessages.destinationRemoved(interaction, res.channelId));
	} catch (err: unknown) {
		logger.error('Unable to remove alert reporting', { err });

		await interaction.reply(AlertReportingMessages.destinationRemoveFailed(interaction));
	}
}
