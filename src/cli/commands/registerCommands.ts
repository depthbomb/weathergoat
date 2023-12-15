import { logger } from '@logger';
import { client } from '@client';
import { Command } from 'clipanion';
import { getOrThrow } from '@config';
import { REST, Routes } from 'discord.js';
import type { BaseContext } from 'clipanion';

export class RegisterCommandsCommand extends Command<BaseContext> {
	public static override paths = [['register'], ['register-commands'], ['rc']];

	public constructor() {
		super();
	}

	public async execute(): Promise<number> {
		const rest = new REST().setToken(getOrThrow<string>('bot.token'));
		const body = [] as unknown[];

		await client.boot(false, false);

		for (const [,command] of client.commands) {
			body.push(command.data.toJSON());
		}

		try {
			await rest.put(Routes.applicationCommands(getOrThrow<string>('bot.id')), { body });

			logger.info('Successfully registered commands');

			return 0;
		} catch (err: unknown) {
			logger.error(err);
			return 1;
		}
	}
}
