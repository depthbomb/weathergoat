import { db } from '@database';
import { $msg } from '@lib/messages';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Ban   = 'ban',
	Unban = 'unban',
}

export default class FeedbackCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			syntax: `feedback <${Subcommands.Ban} | ${Subcommands.Unban}>`,
			description: 'Feedback moderation commands.'
		});
	}

	public async [Subcommands.Ban](message: Message) {
		const userId = this.ctx!.params.getString('user-id', true);
		const reason = this.ctx!.params.getString('reason') ?? 'No reason specified.';

		try {
			await db.feedbackBan.create({ data: { userId, reason } });
			await message.reply($msg.legacyCommands.feedback.ban.success());
		} catch (err) {
			await message.reply($msg.legacyCommands.feedback.ban.error((err as Error).stack?.toCodeBlock()));
		}
	}

	public async [Subcommands.Unban](message: Message) {
		const userId = this.ctx!.params.getString('user-id', true);

		try {
			await db.feedbackBan.delete({ where: { userId } });
			await message.reply($msg.legacyCommands.feedback.unban.success());
		} catch (err) {
			await message.reply($msg.legacyCommands.feedback.unban.error((err as Error).stack?.toCodeBlock()));
		}
	}
}
