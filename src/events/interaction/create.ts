import { client } from '@client';
import { logger } from '@logger';
import { Events } from 'discord.js';
import type { IEvent } from '#IEvent';

export default ({
	event: Events.InteractionCreate,
	async handle(interaction) {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		const command = client.getCommand(interaction.commandName);
		if (!command) {
			return;
		}

		try {
			await interaction.channel?.sendTyping();
			await command.execute(interaction);
		} catch (err: unknown) {
			logger.error('Error handling interaction', { err });
		}
	},
}) satisfies IEvent<Events.InteractionCreate>;
