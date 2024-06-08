import { _ } from '@lib/i18n';
import { logger } from '@lib/logger';
import { captureError } from '@lib/errors';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import type { IEvent } from '@events';
import type { Maybe } from '#types';
import type { ICommand } from '@commands';
import type { CacheType, Interaction } from 'discord.js';

interface IInteractionCreateEvent extends IEvent<'interactionCreate'> {
	[kGetCommandName](interaction: Interaction<CacheType>): Maybe<ICommand>;
}

const kGetCommandName = Symbol('get-command-name-method');

export const interactionCreateEvent: IInteractionCreateEvent = ({
	name: 'interactionCreate',

	[kGetCommandName](interaction: Interaction<CacheType>) {
		if (!('commandName' in interaction)) {
			return;
		}

		return interaction.client.commands.get(interaction.commandName);
	},

	async handle(interaction) {
		const command = this[kGetCommandName](interaction);
		if (!command) return;

		if (interaction.isChatInputCommand()) {
			const sw = new Stopwatch();

			try {
				logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.data.name}`);

				await interaction.channel?.sendTyping();
				return command.handle(interaction);
			} catch (err: unknown) {
				captureError('Error in interaction handler', err, { interaction: interaction.commandName });

				return tryToRespond(interaction, _('events.interactions.err.commandError'));
			} finally {
				logger.info(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			try {
				return command.handleAutocomplete?.(interaction);
			} catch (err: unknown) {
				captureError('Error in autocomplete interaction handler', err, { interaction: interaction.commandName });
			}
		}
	},
});
