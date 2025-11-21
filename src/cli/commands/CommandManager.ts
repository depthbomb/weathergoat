import { env } from '@env';
import { logger } from '@lib/logger';
import { container } from '@container';
import { WeatherGoat } from '@lib/client';
import { REST, Routes } from 'discord.js';
import { Option, Command } from 'clipanion';
import { Stopwatch } from '@sapphire/stopwatch';
import type { LogLayer } from 'loglayer';
import type { BaseContext } from 'clipanion';

export class CommandManagerCommand extends Command<BaseContext> {
	public static override paths = [['manage-commands'], ['mc']];

	public action = Option.String<'create' | 'delete'>({ required: true });
	public guilds = Option.Rest();

	private readonly logger: LogLayer;

	public constructor() {
		super();

		this.logger = logger.child().withPrefix(`[CLI::${CommandManagerCommand.paths.join(',')}]`);
	}

	public async execute() {
		let exitCode = 0;

		const sw     = new Stopwatch();
		const global = this.guilds.length === 0;
		const rest   = new REST().setToken(env.get('BOT_TOKEN'));
		const botId  = env.get('BOT_ID');

		switch (this.action) {
			case 'create':
				const bot = container.get(WeatherGoat);
				await bot.registerCommands();

				const body = [...bot.commands].map(([,command]) => command.data.toJSON());
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body });

					this.logger.info('Registered commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body });

						this.logger.withMetadata({ guildId }).info('Registered commands in guild');
					}

					this.logger.withMetadata({ guildCount: this.guilds.length }).info('Finished Registering commands in guilds');
				}
				break;
			case 'delete':
				if (global) {
					await rest.put(Routes.applicationCommands(botId), { body: [] });

					this.logger.info('Deleted commands globally');
				} else {
					for (const guildId of this.guilds) {
						await rest.put(Routes.applicationGuildCommands(botId, guildId), { body: [] });

						this.logger.withMetadata({ guildId }).info('Deleted command in guild');
					}

					this.logger.withMetadata({ guildCount: this.guilds.length }).info('Finished deleting commands in guilds');
				}
				break;
			default:
				this.logger.error('Invalid action', this.action);
				exitCode = 1;
				break;
		}

		this.logger.withMetadata({ elapsed: sw.stop().toString() }).info('Operation finished');

		return exitCode;
	}
}
