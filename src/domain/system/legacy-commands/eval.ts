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
		const code       = this.ctx.params.getString('code', true).replace(/```(tsx?|jsx?)?/i, '').replace(/```$/, '').trim();
		const transpiler = new Transpiler({ loader: 'ts', target: 'bun' });
		const js         = await transpiler.transform(code);
		const blob       = new Blob([js], { type: 'text/javascript' });
		const url        = URL.createObjectURL(blob);
		const mod        = await import(url);
		const res        = await mod.default({ client: message.client });

		console.log(res);
	}
}
