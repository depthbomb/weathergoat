import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	SendMessage = 'send-message',
}

export class BotCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'user',
			description: 'User management commands.',
			subcommands: {
				[Subcommands.SendMessage]: [
					LegacyCommandParam.string('user-id'),
					LegacyCommandParam.string('message', { rest: true }),
				],
			},
		});
	}

	public async [Subcommands.SendMessage](message: Message) {
		const userId = this.ctx.params.getString('user-id', true);
		const msg    = this.ctx.params.getString('message', true);

		try {
			const user = await message.client.users.fetch(userId);

			const channel = await user.createDM(true);
			await channel.send(msg);
		} catch (err) {
			await message.reply(`Unable to send message to user:\n${(err as Error).name}\n${(err as Error).stack?.toCodeBlock()}`)
		}
	}
}
