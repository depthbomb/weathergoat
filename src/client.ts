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
import type { CommandInteraction, ClientEvents, ChatInputCommandInteraction } from 'discord.js';

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

	public get commands(): Collection<string, ICommand> {
		return this._commands;
	}

	/**
	 * Prepares the bot for connecting to Discord by registering events, commands, and tasks.
	 *
	 * @param loadTasks Whether to load background tasks.
	 *
	 * @param logIn Whether to log in after loading events, commands, and tasks. You may want to
	 * skip logging in when you want to register application commands in Discord.
	 */
	public async boot(loadTasks: boolean = true, logIn: boolean = true): Promise<void> {
		await this.loadEvents();
		await this.loadCommands();

		if (loadTasks) {
			await this.loadTasks();
		}

		if (logIn) {
			await this.login(getOrThrow<string>('bot.token'));
		}
	}

	public getCommand(name: string): ICommand | null {
		if (this.commands.has(name)) {
			return this.commands.get(name)!;
		}

		return null;
	}

	public async executeCommand(command: ICommand, interaction: CommandInteraction): Promise<void> {
		return command.execute(interaction);
	}

	public async executeSubcommand(interaction: ChatInputCommandInteraction, subcommandDict: SubcommandDict) {
		const signature = this.getCommandSignature(interaction);
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

	private async loadEvents(eventsDirectory: string = this._eventsDirectory): Promise<void> {
		const files = await readdir(eventsDirectory);
		for (const file of files) {
			const filePath = join(eventsDirectory, file);

			const stats = await stat(filePath);
			if (stats.isDirectory()) {
				await this.loadEvents(filePath);
				continue;
			}

			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this.loadEvent(filePath);
		}
	}

	private async loadEvent(modulePath: string): Promise<void> {
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

	private async loadCommands(commandsDirectory: string = this._commandsDirectory): Promise<Collection<string, ICommand>> {
		const files = await readdir(commandsDirectory);
		for (const file of files) {
			if (file.startsWith('_')) {
				continue;
			}

			const filePath = join(commandsDirectory, file);
			const stats    = await stat(filePath);
			if (stats.isDirectory()) {
				await this.loadCommands(filePath);
				continue;
			}

			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this.loadCommand(filePath);
		}

		return this.commands;
	}

	private async loadCommand(modulePath: string): Promise<void> {
		const { default: command }: { default: ICommand } = await import(modulePath);
		const { name }                                    = command.data;
		if (!this.commands.has(name)) {
			this.commands.set(name, command);
		}
	}

	private async loadTasks(): Promise<void> {
		const files = await readdir(this._tasksDirectory);
		for (const file of files) {
			if (file.startsWith('_')) {
				continue;
			}

			const filePath = join(this._tasksDirectory, file);
			if (!filePath.endsWith('.js')) {
				continue;
			}

			await this.loadTask(filePath);
		}
	}

	private async loadTask(modulePath: string): Promise<void> {
		const { default: task }: { default: ITask }        = await import(modulePath);
		const { immediate, once, cron, interval, execute } = task;

		if (cron) {
			if (once) {
				logger.warn('`once` is not supported for cron-based tasks');
			} else {
				if (!validate(cron)) {
					throw new Error('Invalid cron expression');
				}

				const timezone = getOrThrow<string>('cron.timezone');

				schedule(cron, async () => await execute(), { timezone });
			}
		}

		if (interval) {
			let delay;
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

	private getCommandSignature(interaction: ChatInputCommandInteraction): string {
		const { options }     = interaction;
		const subcommand      = options.getSubcommand(true);
		const subcommandGroup = options.getSubcommandGroup(false);
		const signature       = `${subcommandGroup ? `${subcommandGroup}/` : ''}${subcommand}`;

		return signature;
	}
}

export const client = new WeatherGoat();
