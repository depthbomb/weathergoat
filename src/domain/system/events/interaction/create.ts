import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseEvent } from '@infra/events';
import { reportError } from '@lib/logger';
import { Stopwatch } from '@sapphire/stopwatch';
import { tryToRespond } from '@utils/interactions';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { MessageBuilder } from '@sapphire/discord.js-utilities';
import { isWeatherGoatError, MaxDestinationError } from '@errors';
import { PreconditionError, isPreconditionError } from '@infra/preconditions';
import type { WeatherGoatError } from '@errors';
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

			if (interaction.client.maintenanceModeFlag.isTrue && command.name !== 'maintenance') {
				const reason = interaction.client.maintenanceModeReason.value;
				await interaction.reply({
					content: $msg.events.interaction.create.maintenanceEnabled(reason.toInlineCode()),
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const sw = new Stopwatch();
			try {
				this.logger
					.withMetadata({ options: JSON.stringify(interaction.options.data) })
					.info(`${interaction.user.tag} (${interaction.user.id}) executed /${command.name}`);

				for (const precondition of command.preconditions ?? []) {
					const result = await precondition.check(interaction);
					if (result.err) {
						throw result.err;
					}
				}

				await command.callHandler(interaction);
			} catch (err: unknown) {
				if (isWeatherGoatError(err)) {
					await tryToRespond(interaction, this.createWeatherGoatErrorMessage(err));
				} else if (isPreconditionError(err)) {
					await tryToRespond(interaction, this.createPreconditionErrorMessage(err));
				} else {
					reportError('Error in interaction handler', err, { interaction: interaction.commandName });

					await tryToRespond(interaction, this.createInteractionFailedErrorMessage());
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
			const sw                   = new Stopwatch();

			try {
				this.logger.info(`${interaction.user.tag} (${interaction.user.id}) used component ${component.name}`);

				await component.callHandler(interaction, match);
			} catch (err: unknown) {
				if (isWeatherGoatError(err)) {
					await tryToRespond(interaction, this.createWeatherGoatErrorMessage(err));
				} else if (isPreconditionError(err)) {
					await tryToRespond(interaction, this.createPreconditionErrorMessage(err));
				} else {
					reportError('Error in component interaction handler', err, { interaction: interaction.customId });

					await tryToRespond(interaction, this.createInteractionFailedErrorMessage());
				}
			} finally {
				this.logger.debug(`Component interaction completed in ${sw.toString()}`);
			}
		}
	}

	private createErrorEmbed(message: string, footerText?: string) {
		const embed = new EmbedBuilder()
			.setColor(Color.Danger)
			.setDescription(message)
			.setTimestamp();

		if (footerText) {
			embed.setFooter({ text: footerText });
		}

		return embed;
	}

	private createWeatherGoatErrorMessage(err: WeatherGoatError) {
		let message = err.message;
		if (err instanceof MaxDestinationError) {
			message = `${message} (${err.max})`;
		}

		return new MessageBuilder().setEmbeds([
			this.createErrorEmbed(message, err.name)
		]);
	}

	private createPreconditionErrorMessage(err: PreconditionError) {
		return new MessageBuilder().setEmbeds([
			this.createErrorEmbed(err.message)
		]);
	}

	private createInteractionFailedErrorMessage() {
		return new MessageBuilder().setEmbeds([
			this.createErrorEmbed($msg.events.interaction.create.commandFailed())
		]);
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
