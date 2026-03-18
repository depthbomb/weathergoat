import { BaseEvent } from '@events';
import { MessageFlags } from 'discord.js';
import { reportError } from '@lib/logger';
import { Stopwatch } from '@sapphire/stopwatch';
import { isWeatherGoatError } from '@lib/errors';
import { tryToRespond } from '@utils/interactions';
import { isPreconditionError } from '@preconditions';
import { INTERACTION_ERROR, WEATHERGOAT_ERROR, PRECONDITION_ERROR } from '@lib/messages';
import type { Interaction, MessageComponentInteraction } from 'discord.js';

export default class InteractionCreateEvent extends BaseEvent<'interactionCreate'> {
	public constructor() {
		super({ name: 'interactionCreate' });
	}

	public async handle(interaction: Interaction) {
		if (interaction.isChatInputCommand() && interaction.channel?.isSendable()) {
			const command = this.getCommand(interaction);
			if (!command) {
				return;
			}

			if (command.name !== 'maintenance' && interaction.client.maintenanceModeFlag.isTrue) {
				const reason = interaction.client.maintenanceModeReason.value;
				await interaction.reply({
					content: `Maintenance in progress: ${reason.toInlineCode()}`,
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const sw = new Stopwatch();
			try {
				this.logger.info(`${interaction.user.tag} (${interaction.user.id}) executed ${command.name}`);

				await interaction.channel.sendTyping();

				if (command.preconditions) {
					for (const precondition of command.preconditions) {
						const result = await precondition.check(interaction);
						if (result.err) {
							throw result.err;
						}
					}
				}

				await command.callHandler(interaction);
			} catch (err: unknown) {
				if (isWeatherGoatError(err)) {
					await tryToRespond(interaction, WEATHERGOAT_ERROR(err));
				} else if (isPreconditionError(err)) {
					await tryToRespond(interaction, PRECONDITION_ERROR(err));
				} else {
					reportError('Error in interaction handler', err, { interaction: interaction.commandName });

					await tryToRespond(interaction, INTERACTION_ERROR());
				}
			} finally {
				this.logger.debug(`Interaction completed in ${sw.toString()}`);
			}
		} else if (interaction.isAutocomplete()) {
			const command = this.getCommand(interaction);
			if (!command) {
				return;
			}

			try {
				await command.handleAutocomplete(interaction);
			} catch (err: unknown) {
				reportError('Error in interaction autocomplete handler', err, { interaction: interaction.commandName });
			}
		} else if (interaction.isMessageComponent()) {
			const resolved = this.getComponent(interaction);
			if (!resolved) {
				return;
			}

			const { component, match } = resolved;
			const sw = new Stopwatch();

			try {
				this.logger.info(`${interaction.user.tag} (${interaction.user.id}) used component ${component.name}`);

				await component.callHandler(interaction, match);
			} catch (err: unknown) {
				if (isWeatherGoatError(err)) {
					await tryToRespond(interaction, WEATHERGOAT_ERROR(err));
				} else if (isPreconditionError(err)) {
					await tryToRespond(interaction, PRECONDITION_ERROR(err));
				} else {
					reportError('Error in component interaction handler', err, { interaction: interaction.customId });

					await tryToRespond(interaction, INTERACTION_ERROR());
				}
			} finally {
				this.logger.debug(`Component interaction completed in ${sw.toString()}`);
			}
		}
	}

	private getCommand(interaction: Interaction) {
		if (!('commandName' in interaction)) {
			return;
		}

		return interaction.client.commands.get(interaction.commandName);
	}

	private getComponent(interaction: MessageComponentInteraction) {
		return interaction.client.getComponentForCustomId(interaction.customId);
	}
}
