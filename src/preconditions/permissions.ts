import { isGuildMember } from '@sapphire/discord.js-utilities';
import { BasePrecondition, PreconditionResult } from '@preconditions';
import type { PermissionResolvable, ChatInputCommandInteraction } from 'discord.js';

export class PermissionsPrecondition extends BasePrecondition {
	public constructor(
		private readonly permissions: PermissionResolvable
	) {
		super();
	}

	public async check(interaction: ChatInputCommandInteraction) {
		const member = interaction.member;
		if (!isGuildMember(member)) {
			return PreconditionResult.fromFailure('This command must be called within a guild.');
		}

		if (!member.permissions.has(this.permissions)) {
			return PreconditionResult.fromFailure('You do not have permission to call this command.');
		}

		return PreconditionResult.fromSuccess();
	}
}
