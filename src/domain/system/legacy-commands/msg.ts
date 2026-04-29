import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Delete = 'delete'
}

export class MsgCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'msg',
			description: 'Commands related to messages.',
			subcommands: {
				[Subcommands.Delete]: [
					LegacyCommandParam.string('id'),
					LegacyCommandParam.bool('delete-invoker'),
				]
			}
		});
	}

	public async [Subcommands.Delete](message: Message) {
		const messageId     = this.ctx.params.getString('id', true);
		const deleteInvoker = this.ctx.params.getBool('delete-invoker', true);

		try {
			const msg = await message.channel.messages.fetch(messageId);
			await msg.delete();

			if (deleteInvoker) {
				await message.delete();
			}
		} catch (err) {
			await message.reply('I am unable to delete that message.');
		}
	}
}
