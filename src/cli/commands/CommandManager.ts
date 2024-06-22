import { logger } from '@logger';
import { WeatherGoat } from '@client';
import { REST, Routes } from 'discord.js';
import { Option, Command } from 'clipanion';
import { Stopwatch } from '@sapphire/stopwatch';
import type { Logger } from 'winston';
import type { BaseContext } from 'clipanion';

export class CommandManagerCommand extends Command<BaseContext> {
	private readonly _logger: Logger;

	public static override paths = [['manage-commands'], ['mc']];

	public action = Option.String<'create' | 'delete'>({ required: true });
	public guilds = Option.Rest();

	public constructor() {
		super();

		this._logger = logger.child({ name: 'CLI' });
	}

	public async execute() {
		let exitCode = 0;

		const sw = new Stopwatch();
		const global = this.guilds.length === 0;
		const rest = new REST().setToken(process.env.BOT_TOKEN);
		const botId = process.env.BOT_ID;

		switch (this.action) {
			case 'create':
				const bot = new WeatherGoat({ intents: [], dry: true });
				await bot.registerCommands();

				const body = [...bot.commands].map(([,command]) => command.data.toJSON());
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body });

					this._logger.info('Registered commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body });

						this._logger.info('Registered commands in guild', { guildId });
					}

					this._logger.info(`Finished Registering commands in guilds`, { guildCount: this.guilds.length });
				}
				break;
			case 'delete':
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body: [] });

					this._logger.info('Deleted commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body: [] });

						this._logger.info('Deleted command in guild', { guildId });
					}

					this._logger.info('Finished deleting commands in guilds', { guildCount: this.guilds.length });
				}
				break;
			default:
				this._logger.error('Invalid action', this.action);
				exitCode = 1;
				break;
		}

		this._logger.info('Operation finished', { elapsed: sw.stop().toString() });

		return exitCode;
	}
}
