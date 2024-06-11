import { codeBlock } from 'discord.js';
import { serviceManager } from '@services';
import { featuresService } from '@services/features';
import { Lexer, Parser, ArgumentStream, PrefixedStrategy } from '@sapphire/lexure';
import type { IEvent } from '@events';
import type { Message } from 'discord.js';

interface IMessageCreateEvent extends IEvent<'messageCreate'> {
	[kParser]: Parser;
	[kLexer]: Lexer;
	[kExecuteLegacyCommand](message: Message<boolean>, command: string, args: string[]): Promise<unknown>;
}

const prefix                = process.env.LEGACY_COMMAND_PREFIX ?? '!';
const kParser               = Symbol('parser');
const kLexer                = Symbol('lexer');
const kExecuteLegacyCommand = Symbol('execute-legacy-command');

export const debugEvent: IMessageCreateEvent = ({
	name: 'messageCreate',

	[kParser]: new Parser(new PrefixedStrategy([prefix, '--', '/'], ['=', ':'])),
	[kLexer]: new Lexer({ quotes: [['"', '"'], ['“', '”'], ['「', '」'], ['«', '»']] }),
	async [kExecuteLegacyCommand](message, command, args) {
		switch (command) {
			case 'list-services':
				await message.channel.send(codeBlock('json', JSON.stringify(serviceManager.all(), null, 4)));
				break;
			case 'list-features':
				await message.channel.send(codeBlock('json', JSON.stringify(featuresService.all(), null, 4)));
				break;
			case 'list-jobs':
				await message.channel.send(codeBlock('json', JSON.stringify(Array.from(message.client.jobs.values()), null, 4)));
				break;
		}
	},

	async handle(message) {
		const content = message.cleanContent.trim();
		if (content.startsWith(process.env.LEGACY_COMMAND_PREFIX ?? '!')) {
			const split   = content.split(' ');
			const command = split.find(s => s.startsWith(prefix))?.replace(prefix, '')?.toLowerCase();
			if (command) {
				const rest   = split.find(s => !s.endsWith(command)) ?? '';
				const stream = new ArgumentStream(this[kParser].run(this[kLexer].run(rest)));
				const args   = stream.results.ordered.map(r => r.value);
				if (message.author.id === process.env.OWNER_ID) {
					await this[kExecuteLegacyCommand](message, command, args);
				}
			}
		}
	}
});
