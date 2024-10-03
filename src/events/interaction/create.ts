import { _ } from '@i18n';
import { BaseEvent } from '@events';
import { logger, reportError } from '@logger';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import { isPreconditionError } from '@preconditions';
import { isWeatherGoatError, MaxDestinationError } from '@errors';
import type { Logger } from 'winston';
import type { Interaction } from 'discord.js';
import type { BaseCommandWithAutocomplete } from '@commands';

export default class InteractionCreateEvent extends BaseEvent<'interactionCreate'> {
	private readonly _logger: Logger;

	public constructor() {
		super({ name: 'interactionCreate' });

		this._logger = logger.child({ discordEvent: this.name });
	}

	public async handle(interaction: Interaction) {
		const command = this._getCommand(interaction);
		if (!command) return;

		if (interaction.isChatInputCommand() && interaction.channel?.isSendable()) {
			const sw = new Stopwatch();

			try {
				this._logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.name}`);

				await interaction.channel.sendTyping();

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
					reportError('Error in interaction handler', err, { interaction: interaction.commandName });

					await tryToRespond(interaction, _('events.interactions.err.commandError'));
				}
			} finally {
				this._logger.info(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			try {
				await (command as BaseCommandWithAutocomplete).handleAutocomplete?.(interaction);
			} catch (err: unknown) {
				reportError('Error in autocomplete interaction handler', err, { interaction: interaction.commandName });
			}
		}
	}

	private _getCommand(interaction: Interaction) {
		if (!('commandName' in interaction)) return;

		return interaction.client.commands.get(interaction.commandName);
	}
}
