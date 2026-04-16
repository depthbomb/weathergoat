import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

export default class HelpCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'help',
			description: 'Lists available legacy commands.',
		});
	}

	public async run(message: Message) {
		const prefix = this.ctx.prefix;
		const lines  = this.ctx.commands.summaries()
			.map(command => {
				const usageLines = command.usageLines.map(line => `  - \`${prefix}${line}\``).join('\n');
				return [
					`- \`${command.name}\` - ${command.description ?? 'No description'}`,
					usageLines,
				].join('\n');
			})
			.sort((a, b) => a.localeCompare(b));

		await message.reply(lines.join('\n'));
	}
}
