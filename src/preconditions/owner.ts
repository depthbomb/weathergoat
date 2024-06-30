import { TeamMemberRole } from 'discord.js';
import { BasePrecondition, PreconditionResult } from '@preconditions';
import type { ChatInputCommandInteraction } from 'discord.js';

export class OwnerPrecondition extends BasePrecondition {
	public constructor() {
		super();
	}

	public async check(interaction: ChatInputCommandInteraction) {
		const userId = interaction.user.id;

		if (!interaction.client.application.owner) {
			await interaction.client.application.fetch();
		}

		const owner = interaction.client.application.owner!;
		if ('members' in owner) {
			const isTeamAdmin = owner.members.some(m => m.id === userId && (m.role === TeamMemberRole.Admin || m.role === TeamMemberRole.Developer));
			if (!isTeamAdmin) {
				return PreconditionResult.fromFailure(`You must be an admin or developer of team **${owner.name}** to use this command.`);
			}
		} else {
			if (owner.id !== userId) {
				return PreconditionResult.fromFailure(`This command may only be executed by ${owner}.`);
			}
		}

		return PreconditionResult.fromSuccess();
	}
}
