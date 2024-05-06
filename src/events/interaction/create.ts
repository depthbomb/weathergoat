import { DiscordEvent } from '@events';
import { logger } from '@lib/logger';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import type { CacheType, Interaction } from 'discord.js';

export default class InteractionCreateEvent extends DiscordEvent<'interactionCreate'> {
	public constructor() {
		super({ name: 'interactionCreate' });
	}

	public async handle(interaction: Interaction<CacheType>) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) return;

		const sw = new Stopwatch();

		logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.data.name}`);

		try {
			await interaction.channel?.sendTyping();
			await command.handle(interaction);
		} catch (err: any) {
			return tryToRespond(interaction, err.message);
		} finally {
			logger.info(`Interaction completed in ${sw.toString()}`);
		}
	}
}
