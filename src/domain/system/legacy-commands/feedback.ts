import { db } from '@database';
import { $msg } from '@lib/messages';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Ban   = 'ban',
	Unban = 'unban',
}

export default class FeedbackCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'feedback',
			description: 'Feedback moderation commands.',
			subcommands: {
				[Subcommands.Ban]: [
					LegacyCommandParam.string('user-id'),
					LegacyCommandParam.string('reason', { required: false, rest: true }),
				],
				[Subcommands.Unban]: [
					LegacyCommandParam.string('user-id'),
				],
			},
		});
	}

	public async [Subcommands.Ban](message: Message) {
		const userId = this.ctx.params.getString('user-id', true);
		const reason = this.ctx.params.getString('reason') ?? 'No reason specified.';

		try {
			await db.feedbackBan.create({ data: { userId, reason } });
			await message.reply($msg.legacyCommands.feedback.ban.success());
		} catch (err) {
			await message.reply($msg.legacyCommands.feedback.ban.error((err as Error).stack?.toCodeBlock()));
		}
	}

	public async [Subcommands.Unban](message: Message) {
		const userId = this.ctx.params.getString('user-id', true);

		try {
			await db.feedbackBan.delete({ where: { userId } });
			await message.reply($msg.legacyCommands.feedback.unban.success());
		} catch (err) {
			await message.reply($msg.legacyCommands.feedback.unban.error((err as Error).stack?.toCodeBlock()));
		}
	}
}
