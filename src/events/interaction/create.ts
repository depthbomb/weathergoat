import { _ } from '@lib/i18n';
import { BaseEvent } from '@events';
import { logger } from '@lib/logger';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import { isPreconditionError } from '@preconditions';
import { captureError, isWeatherGoatError, MaxDestinationError } from '@lib/errors';
import type { CacheType, Interaction } from 'discord.js';
import type { BaseCommandWithAutocomplete } from '@commands';

export default class InteractionCreateEvent extends BaseEvent<'interactionCreate'> {
	public constructor() {
		super({ name: 'interactionCreate' });
	}

	public async handle(interaction: Interaction<CacheType>) {
		const command = this._getCommand(interaction);
		if (!command) return;

		if (interaction.isChatInputCommand()) {
			const sw = new Stopwatch();

			try {
				logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.name}`);

				await interaction.channel?.sendTyping();

				if (command.preconditions) {
					for (const precondition of command.preconditions) {
						const result = await precondition.check(interaction, interaction.client.container);
						if (result.err) {
							throw result.err;
						}
					}
				}

				await command.handle(interaction);
			} catch (err: unknown) {
				if (isWeatherGoatError(err)) {
					if (err instanceof MaxDestinationError) {
						await tryToRespond(interaction, `[${err.name}] ${err.message} (${err.max}).`);
					} else {
						await tryToRespond(interaction, `[${err.name}] ${err.message}.`);
					}
				} else if (isPreconditionError(err)) {
					await tryToRespond(interaction, err.message);
				} else {
					captureError('Error in interaction handler', err, { interaction: interaction.commandName });

					await tryToRespond(interaction, _('events.interactions.err.commandError'));
				}
			} finally {
				logger.info(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			try {
				await (command as BaseCommandWithAutocomplete).handleAutocomplete?.(interaction);
			} catch (err: unknown) {
				captureError('Error in autocomplete interaction handler', err, { interaction: interaction.commandName });
			}
		}
	}

	private _getCommand(interaction: Interaction<CacheType>) {
		if (!('commandName' in interaction)) return;

		return interaction.client.commands.get(interaction.commandName);
	}
}
