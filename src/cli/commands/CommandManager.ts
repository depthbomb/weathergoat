import { logger } from '@lib/logger';
import { WeatherGoat } from '@lib/client';
import { REST, Routes } from 'discord.js';
import { Option, Command } from 'clipanion';
import type { BaseContext } from 'clipanion';

export class CommandManagerCommand extends Command<BaseContext> {
	public static override paths = [['manage-commands'], ['mc']];

	public action = Option.String<'create' | 'delete'>({ required: true });
	public guilds = Option.Rest();

	public async execute(): Promise<number> {
		let exitCode = 0;

		const global = this.guilds.length === 0;
		const rest   = new REST().setToken(process.env.BOT_TOKEN);
		const botId  = process.env.BOT_ID;

		switch (this.action) {
			case 'create':
				const bot = new WeatherGoat({ intents: [] });
				await bot.registerCommands();
				const body = [...bot.commands].map(([, command]) => command.data.toJSON());
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body });

					logger.info('Registered commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body });
					}

					logger.info(`Registered commands in ${this.guilds.length} guild(s)`);
				}
				break;
			case 'delete':
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body: [] });

					logger.info('Deleted commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body: [] });
					}

					logger.info(`Deleted commands in ${this.guilds.length} guild(s)`);
				}
				break;
			default:
				logger.error('Invalid action', this.action);
				exitCode = 1;
				break;
		}

		return exitCode;
	}
}
