import { $msg } from '@lib/messages';
import { isGuildMember } from '@sapphire/discord.js-utilities';
import { BasePrecondition, PreconditionResult } from '@infra/preconditions';
import type { PermissionResolvable, ChatInputCommandInteraction } from 'discord.js';

export class PermissionsPrecondition extends BasePrecondition {
	public constructor(
		private readonly permissions: PermissionResolvable
	) {
		super();
	}

	public async check(interaction: ChatInputCommandInteraction) {
		const member = interaction.member;
		if (!isGuildMember(member) || !member.permissions.has(this.permissions)) {
			return PreconditionResult.fromFailure($msg.preconditions.permissions.noPermission());
		}

		return PreconditionResult.fromSuccess();
	}
}
