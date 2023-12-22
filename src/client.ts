import { join } from 'node:path';
import { logger } from '@logger';
import { database } from '@data';
import { getOrThrow } from '@config';
import { ROOT_DIR } from '@constants';
import { validate, schedule } from 'node-cron';
import { stat, readdir } from 'node:fs/promises';
import { Duration, TimerManager } from '@sapphire/time-utilities';
import { Client, Partials, Collection, GatewayIntentBits } from 'discord.js';
import type { ITask } from '#ITask';
import type { IEvent } from '#IEvent';
import type { ICommand } from '#ICommand';
import type { CommandInteraction, ClientEvents, InteractionReplyOptions, ChatInputCommandInteraction } from 'discord.js';

type SubcommandDict = {
	[subcommandName: string]: (interaction: ChatInputCommandInteraction) => Promise<any>;
}

export class WeatherGoat extends Client {
	private readonly _eventsDirectory: string;
	private readonly _commandsDirectory: string;
	private readonly _tasksDirectory: string;
	private readonly _handledEvents: Set<keyof ClientEvents>;
	private readonly _commands: Collection<string, ICommand>;

	public constructor() {
		super({
			shards: 'auto',
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildWebhooks,
			],
			allowedMentions: { repliedUser: true },
			partials: [
				Partials.Message,
				Partials.Channel,
			]
		});

		this._eventsDirectory   = join(ROOT_DIR, 'events');
		this._commandsDirectory = join(ROOT_DIR, 'commands', 'slash');
		this._tasksDirectory    = join(ROOT_DIR, 'tasks');
		this._handledEvents     = new Set<keyof ClientEvents>();
		this._commands          = new Collection<string, ICommand>();
	}

	public get commands() {
		return this._commands;
	}

	/**
	 * Prepares the bot for connecting to Discord by registering events, commands, and tasks.
	 *
	 * @param loadTasks Whether to load background tasks.
	 *
	 * @param logIn Whether to log in after loading events, commands, and tasks. Useful for
	 * registering application commands in Discord.
	 */
	public async boot(loadTasks: boolean = true, logIn: boolean = true) {
		await this._loadEvents();
		await this._loadCommands();

		if (loadTasks) {
			await this._loadTasks();
		}

		if (logIn) {
			await this.login(getOrThrow<string>('bot.token'));
		}
	}

	public async reply(interaction: CommandInteraction, options: string | InteractionReplyOptions) {
		const { replied, deferred } = interaction;
		if (!deferred) {
			if (replied) {
				return interaction.followUp(options);
			}

			if (typeof options === 'string') {
				return interaction.reply({ content: options, fetchReply: true });
			}

			return interaction.reply({ ...options, fetchReply: true });
		}

		return interaction.editReply(options);
	}

	public getCommand(name: string): ICommand | null {
		if (this.commands.has(name)) {
			return this.commands.get(name)!;
		}

		return null;
	}

	public async executeCommand(command: ICommand, interaction: CommandInteraction) {
		return command.execute(interaction);
	}

	public async executeSubcommand(interaction: ChatInputCommandInteraction, subcommandDict: SubcommandDict) {
		const signature = this._getCommandSignature(interaction);
		if (signature in subcommandDict) {
			const method = subcommandDict[signature]!;
			await method(interaction);
		}
	}

	public async shutDown() {
		TimerManager.destroy();
		this.user?.setPresence({ status: 'invisible' }); // So we go offline in the member list
		await this.destroy();
		await database.$disconnect();
	}

	private async _loadEvents(eventsDirectory: string = this._eventsDirectory) {
		const files = await readdir(eventsDirectory);
		for (const file of files) {
			const filePath = join(eventsDirectory, file);

			const stats = await stat(filePath);
			if (stats.isDirectory()) {
				await this._loadEvents(filePath);
				continue;
			}

			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this._loadEvent(filePath);
		}
	}

	private async _loadEvent(modulePath: string) {
		const { default: ev }: { default: IEvent } = await import(modulePath);
		const { event, once, disabled, handle }    = ev;

		if (this._handledEvents.has(event)) {
			return;
		}

		if (!disabled) {
			if (once) {
				this.once(event, handle);
			} else {
				this.on(event, handle);
			}

			this._handledEvents.add(event);
		}
	}

	private async _loadCommands(commandsDirectory: string = this._commandsDirectory) {
		const files = await readdir(commandsDirectory);
		for (const file of files) {
			if (file.startsWith('_')) {
				continue;
			}

			const filePath = join(commandsDirectory, file);
			const stats    = await stat(filePath);
			if (stats.isDirectory()) {
				await this._loadCommands(filePath);
				continue;
			}

			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this._loadCommand(filePath);
		}

		return this.commands;
	}

	private async _loadCommand(modulePath: string) {
		const { default: command }: { default: ICommand } = await import(modulePath);
		const { name }                                    = command.data;
		if (!this.commands.has(name)) {
			this.commands.set(name, command);
		}
	}

	private async _loadTasks() {
		const files = await readdir(this._tasksDirectory);
		for (const file of files) {
			if (file.startsWith('_')) {
				continue;
			}

			const filePath = join(this._tasksDirectory, file);
			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this._loadTask(filePath);
		}
	}

	private async _loadTask(modulePath: string) {
		const { default: task }: { default: ITask }        = await import(modulePath);
		const { immediate, once, cron, interval, execute } = task;

		if (cron) {
			if (once) {
				logger.error('`once` is not supported for cron-based tasks');
			} else {
				if (!validate(cron)) {
					throw new Error('Invalid cron expression');
				}

				const timezone = getOrThrow<string>('cron.timezone');

				schedule(cron, execute, { timezone });
			}
		}

		if (interval) {
			let delay: number;
			if (typeof interval === 'number') {
				delay = interval;
			} else {
				delay = new Duration(interval).offset;
			}

			if (once) {
				TimerManager.setTimeout(execute, delay);
			} else {
				TimerManager.setInterval(execute, delay);
			}
		}

		if (immediate) {
			this.once('ready', async () => void await execute());
		}
	}

	private _getCommandSignature(interaction: ChatInputCommandInteraction) {
		const { options }     = interaction;
		const subcommand      = options.getSubcommand(true);
		const subcommandGroup = options.getSubcommandGroup(false);
		const signature       = `${subcommandGroup ? `${subcommandGroup}/` : ''}${subcommand}`;

		return signature;
	}
}

export const client = new WeatherGoat();
