import { db } from '@db';
import { Cron } from 'croner';
import initI18n from '@lib/i18n';
import { logger } from '@lib/logger';
import { captureError } from '@lib/errors';
import { init } from '@paralleldrive/cuid2';
import { Client, Collection } from 'discord.js';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR } from '@constants';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import type { Job } from '@jobs';
import type { Command } from '@commands';
import type { DiscordEvent } from '@events';
import type { TextChannel, ClientEvents, ClientOptions } from 'discord.js';

type ClassModule<T> = { default: new() => T };
type CommandModule  = ClassModule<Command>;
type EventModule    = ClassModule<DiscordEvent<keyof ClientEvents>>;
type JobModule      = ClassModule<Job>;

export class WeatherGoat<T extends boolean> extends Client<T> {
	public readonly jobs: Set<Job>;
	public readonly events: Collection<string, DiscordEvent<keyof ClientEvents>>;
	public readonly commands: Collection<string, Command>;
	public readonly brandColor = '#5876aa';

	private readonly _idGenerators: Collection<number, () => string>;
	private readonly _moduleFilePattern: RegExp;

	public constructor(options: ClientOptions) {
		super(options);

		this.jobs     = new Set();
		this.events   = new Collection();
		this.commands = new Collection();

		this._idGenerators      = new Collection();
		this._moduleFilePattern = /^(?!index\.ts$)(?!_)[\w-]+\.ts$/;
	}

	public async login(token?: string | undefined): Promise<string> {
		await initI18n();
		await this.registerJobs();
		await this.registerEvents();
		await this.registerCommands();

		return super.login(token);
	}

	public async destroy() {
		logger.info('Shutting down', { date: new Date() });

		await db.$disconnect();

		if (!logger.closed) {
			logger.close();
		}

		return super.destroy();
	}

	public async getOrCreateWebhook(channel: TextChannel, name: string, reason?: string) {
		const webhooks = await channel.fetchWebhooks();
		let ourWebhook = webhooks.find(w => w.name === name);
		if (!ourWebhook) {
			ourWebhook = await channel.createWebhook({ name, reason });

			logger.info('Created webhook', { name, channel: channel.name } );
		}

		return ourWebhook;
	}

	public generateId(length: number) {
		let generateFunc: () => string;
		if (!this._idGenerators.has(length)) {
			generateFunc = init({ length });
			this._idGenerators.set(length, generateFunc);
		} else {
			generateFunc = this._idGenerators.get(length)!;
		}

		return generateFunc();
	}

	public async registerJobs() {
		for await (const file of findFilesRecursivelyRegex(JOBS_DIR, this._moduleFilePattern)) {
			const { default: jobClass }: JobModule = await import(file);
			const job = new jobClass();

			if (this.jobs.has(job)) continue;

			const j = Cron(job.pattern, async (self: Cron) => job.execute(this, self), {
				name: job.name,
				paused: true,
				protect: (job) => logger.warn('Job overrun', { name: job.name, calledAt: job.currentRun()?.getDate() }),
				catch: (err: any) => captureError('Job error', err, { name: job.name })
			});

			this.jobs.add(job);

			if (job.runImmediately) {
				if (job.waitUntilReady) {
					this.once('ready', async () => {
						await job.execute(this, j);
						j.resume();
					});
				} else {
					await job.execute(this, j);
					j.resume();
				}
			} else {
				this.once('ready', () => void j.resume());
			}

			logger.info('Registered job', {
				name: job.name,
				pattern: job.pattern,
				waitUntilReady: job.waitUntilReady,
				runImmediately: job.runImmediately,
			});
		}
	}

	public async registerEvents() {
		for await (const file of findFilesRecursivelyRegex(EVENTS_DIR, this._moduleFilePattern)) {
			const { default: eventClass }: EventModule = await import(file);
			const event = new eventClass();

			if (event.disabled) continue;
			if (this.events.has(event.name)) continue;
			if (event.once) {
				this.once(event.name, async (...args) => await event.handle(...args));
			} else {
				this.on(event.name, async (...args) => await event.handle(...args));
			}

			this.events.set(event.name, event);

			logger.info('Registered event', { name: event.name, once: event.once });
		}
	}

	public async registerCommands() {
		for await (const file of findFilesRecursivelyRegex(COMMANDS_DIR, this._moduleFilePattern)) {
			const { default: commandClass }: CommandModule = await import(file);
			const command = new commandClass();
			const { name } = command.data;

			this.commands.set(name, command);

			logger.info('Registered command', { name });
		}
	}
}
