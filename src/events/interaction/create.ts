import { logger } from '@lib/logger';
import { DiscordEvent } from '@events';
import { captureError } from '@lib/errors';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import type { CacheType, Interaction, CommandInteraction } from 'discord.js';

export default class InteractionCreateEvent extends DiscordEvent<'interactionCreate'> {
	public constructor() {
		super({ name: 'interactionCreate' });
	}

	public async handle(interaction: Interaction<CacheType>) {
		const command = this._getCommandName(interaction);

		if (!command) return;

		if (interaction.isChatInputCommand()) {
			const sw = new Stopwatch();

			try {
				logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.data.name}`);

				await interaction.channel?.sendTyping();
				await command.handle(interaction);
			} catch (err: unknown) {
				captureError('Error in interaction handler', err, { interaction });

				return tryToRespond(interaction as CommandInteraction, 'Test');
			} finally {
				logger.info(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			try {
				await command.handleAutocomplete?.(interaction);
			} catch (err: unknown) {
				captureError('Error in autocomplete interaction handler', err, { interaction });
			}
		}
	}

	private _getCommandName(interaction: Interaction<CacheType>) {
		if (!('commandName' in interaction)) {
			return null;
		}

		return interaction.client.commands.get(interaction.commandName);
	}
}
