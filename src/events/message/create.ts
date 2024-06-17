import { Tokens } from '@container';
import { BaseEvent } from '@events';
import { codeBlock } from 'discord.js';
import { Lexer, Parser, ArgumentStream, PrefixedStrategy } from '@sapphire/lexure';
import type { Message } from 'discord.js';
import type { Container } from '@container';
import type { IFeaturesService } from '@services/features';

export default class MessageCreateEvent extends BaseEvent<'messageCreate'> {
	private readonly _lexer: Lexer;
	private readonly _parser: Parser;
	private readonly _prefix: string;
	private readonly _features: IFeaturesService;

	public constructor(container: Container) {
		super({ name: 'messageCreate' });

		this._prefix   = process.env.LEGACY_COMMAND_PREFIX ?? '!';
		this._lexer    = new Lexer({ quotes: [['"', '"'], ['“', '”'], ['「', '」'], ['«', '»']] });
		this._parser   = new Parser(new PrefixedStrategy([this._prefix, '--', '/'], ['=', ':']));
		this._features = container.resolve(Tokens.Features);
	}

	public async handle(message: Message<boolean>) {
		const content = message.cleanContent.trim();
		if (content.startsWith(process.env.LEGACY_COMMAND_PREFIX ?? '!')) {
			const split   = content.split(' ');
			const command = split.find(s => s.startsWith(this._prefix))?.replace(this._prefix, '')?.toLowerCase();
			if (command) {
				const rest = split.find(s => !s.endsWith(command)) ?? '';
				const stream = new ArgumentStream(this._parser.run(this._lexer.run(rest)));
				const args = stream.results.ordered.map(r => r.value);
				if (message.author.id === process.env.OWNER_ID) {
					await this._executeLegacyCommand(message, command, args);
				}
			}
		}
	}

	private async _executeLegacyCommand(message: Message<boolean>, command: string, args: string[]) {
		switch (command) {
			case 'list-features':
				await message.channel.send(codeBlock('json', JSON.stringify(this._features.all(), null, 4)));
				break;
			case 'list-jobs':
				await message.channel.send(codeBlock('json', JSON.stringify(Array.from(message.client.jobs.values()), null, 4)));
				break;
		}
	}
}
