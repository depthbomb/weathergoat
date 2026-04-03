import { env } from '@env';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

export default class HelpCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			syntax: 'help',
			description: 'Lists available legacy commands.'
		});
	}

	public async run(message: Message) {
		const prefix = this.ctx?.prefix ?? env.get('OWNER_PREFIX');
		const lines  = (this.ctx?.commands.summaries() ?? [])
			.map(command => {
				const usage = `${prefix}${command.syntax}`;
				return [
					`- \`${command.name}\` - ${command.description ?? 'No description'}`,
					`  - Usage: \`${usage}\``,
				].join('\n');
			})
			.sort((a, b) => a.localeCompare(b));

		await message.reply(lines.join('\n'));
	}
}
