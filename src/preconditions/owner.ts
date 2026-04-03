import { $msg } from '@lib/messages';
import { TeamMemberRole } from 'discord.js';
import { BasePrecondition, PreconditionResult } from '@infra/preconditions';
import type { ChatInputCommandInteraction } from 'discord.js';

export class OwnerPrecondition extends BasePrecondition {
	public constructor() {
		super();
	}

	public async check(interaction: ChatInputCommandInteraction) {
		const userId = interaction.user.id;
		const owner  = interaction.client.application.owner!;
		if ('members' in owner) {
			const isTeamAdmin = owner.members.some(m => m.id === userId && (m.role === TeamMemberRole.Admin || m.role === TeamMemberRole.Developer));
			if (!isTeamAdmin) {
				return PreconditionResult.fromFailure($msg.preconditions.owner.userMustBeTeamMember(owner.name));
			}
		} else {
			if (owner.id !== userId) {
				return PreconditionResult.fromFailure($msg.preconditions.owner.userMustBeOwner(owner.toString()));
			}
		}

		return PreconditionResult.fromSuccess();
	}
}
