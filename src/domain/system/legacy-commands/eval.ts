import util from 'node:util';
import { Transpiler } from 'bun';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

export class EvalCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'eval',
			description: 'Evaluates arbitrary TypeScript code.',
			params: [
				LegacyCommandParam.string('code', { rest: true }),
			]
		});
	}

	public async run(message: Message) {
		const code        = this.ctx.params.getString('code', true).replace(/```(tsx?|jsx?)?/i, '').replace(/```$/, '').trim();
		const body        = code.includes('return') ? code : `return (${code})`;
		const wrapped     = `export default async (ctx) => { const { client, message } = ctx; ${body} };`;
		const transpiler  = new Transpiler({ loader: 'ts', target: 'bun' });
		const js          = await transpiler.transform(wrapped);
		const logs        = [] as string[];
		const originalLog = console.log;

		console.log = (...args: any[]) => {
			logs.push(
				args.map(a => typeof a === 'string' ? a : util.inspect(a, { depth: 1 })).join(' ')
			);
		};

		try {
			const blob = new Blob([js], { type: 'text/javascript' });
			const url  = URL.createObjectURL(blob);
			const mod  = await import(url);

			URL.revokeObjectURL(url);

			const result    = await mod.default({ client: message.client, message });
			const formatted = typeof result === 'string' ? result : util.inspect(result, { depth: 1 });

			await message.reply(`Success:\n${formatted.toCodeBlock('ts')}`);
		} catch (err) {
			await message.reply(`Error:\n${(err instanceof Error ? err.stack! : String(err)).toCodeBlock('ts')}`);
		} finally {
			console.log = originalLog;
		}
	}
}
