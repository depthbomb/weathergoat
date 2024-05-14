import { _ } from '@lib/i18n';
import { logger } from '@lib/logger';
import { DiscordEvent } from '@events';
import { captureError } from '@lib/errors';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import type { CacheType, Interaction } from 'discord.js';

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
				captureError('Error in interaction handler', err, { interaction: interaction.commandName });

				await tryToRespond(interaction, _('interactions.err.commandError'));
			} finally {
				logger.info(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			try {
				await command.handleAutocomplete?.(interaction);
			} catch (err: unknown) {
				captureError('Error in autocomplete interaction handler', err, { interaction: interaction.commandName });
			}
		}
	}

	private _getCommandName(interaction: Interaction<CacheType>) {
		if (!('commandName' in interaction)) {
			return;
		}

		return interaction.client.commands.get(interaction.commandName);
	}
}
