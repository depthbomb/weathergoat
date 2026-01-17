import { BaseEvent } from '@events';
import { Stopwatch } from '@sapphire/stopwatch';
import { isWeatherGoatError } from '@lib/errors';
import { logger, reportError } from '@lib/logger';
import { tryToRespond } from '@utils/interactions';
import { isPreconditionError } from '@preconditions';
import { WEATHERGOAT_ERROR, INTERACTION_ERROR, PRECONDITION_ERROR } from '@lib/messages';
import type { LogLayer } from 'loglayer';
import type { BaseCommand } from '@commands';
import type { Interaction } from 'discord.js';
import type { Maybe } from '@depthbomb/common/types';

export default class InteractionCreateEvent extends BaseEvent<'interactionCreate'> {
	private readonly logger: LogLayer;

	public constructor() {
		super({ name: 'interactionCreate' });

		this.logger = logger.child().withPrefix(`[Event::${this.name}]`);
	}

	public async handle(interaction: Interaction) {
		const command = this.getCommand(interaction);
		if (!command) {
			return;
		}

		if (interaction.isChatInputCommand() && interaction.channel?.isSendable()) {
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
			try {
				await command.handleAutocomplete(interaction);
			} catch (err: unknown) {
				reportError('Error in interaction autocomplete handler', err, { interaction: interaction.commandName });
			}
		}
	}

	private getCommand(interaction: Interaction): Maybe<BaseCommand> {
		if (!('commandName' in interaction)) return;

		return interaction.client.commands.get(interaction.commandName);
	}
}
