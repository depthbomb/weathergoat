import { BasePrecondition } from '@preconditions';
import { PreconditionResult } from '@preconditions';
import type { ChatInputCommandInteraction } from 'discord.js';

export class OwnerPrecondition extends BasePrecondition {
	public constructor() {
		super();
	}

	public async check(interaction: ChatInputCommandInteraction) {
		if (!interaction.client.application.owner) {
			await interaction.client.application.fetch();
		}

		if (interaction.client.application.owner!.id !== interaction.user.id) {
			return PreconditionResult.fromFailure('This command may only be executed by my owner.');
		}

		return PreconditionResult.fromSuccess();
	}
}
