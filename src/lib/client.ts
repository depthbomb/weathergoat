import { db } from '@db';
import { Cron } from 'croner';
import initI18n from '@lib/i18n';
import { logger } from '@lib/logger';
import { Container } from '@container';
import { captureError } from '@lib/errors';
import { init } from '@paralleldrive/cuid2';
import { Client, Collection } from 'discord.js';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR } from '@constants';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import type { BaseJob } from '@jobs';
import type { BaseEvent } from '@events';
import type { BaseCommand, BaseCommandWithAutocomplete } from '@commands';
import type { TextChannel, ClientEvents, ClientOptions } from 'discord.js';

type BaseModule<T> = { default: new(container: Container) => T };
type JobModule     = BaseModule<BaseJob>;
type EventModule   = BaseModule<BaseEvent<keyof ClientEvents>>;
type CommandModule = BaseModule<BaseCommand | BaseCommandWithAutocomplete>;

export class WeatherGoat<T extends boolean = boolean> extends Client<T> {
	public readonly jobs: Set<BaseJob>;
	public readonly events: Collection<string, BaseEvent<keyof ClientEvents>>;
	public readonly commands: Collection<string, BaseCommand | BaseCommandWithAutocomplete>;
	public readonly container: Container;
	public readonly brandColor = '#5876aa';

	private readonly _idGenerators: Collection<number, () => string>;
	private readonly _moduleFilePattern: RegExp;

	/**
	 * Creates a new instance of {@link WeatherGoat}.
	 *
	 * @param options Options to pass to the {@link Client}.
	 * @param dry Whether the service container should be "dry". This allows services and values to
	 * be resolved whether they are registered or not and will return `null`. This is useful if you
	 * need to work with services that have other services injected into them in which they are not
	 * actually needed, such as when pushing command data to Discord.
	 */
	public constructor(options: ClientOptions, dry = false) {
		super(options);

		this.container = new Container(dry);

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
		await super.destroy();
		await this.container.dispose();

		if (!logger.closed) {
			logger.close();
		}
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
			const { default: mod }: JobModule = await import(file);

			const job = new mod(this.container);

			if (this.jobs.has(job)) continue;

			const name           = job.name;
			const pattern        = job.pattern;
			const runImmediately = job.runImmediately ?? false;
			const waitUntilReady = job.waitUntilReady ?? true;

			const j = Cron(pattern, async (self: Cron) => await job.execute(this, self), {
				name,
				paused: true,
				protect: (job) => logger.warn('Job overrun', { name, calledAt: job.currentRun()?.getDate() }),
				catch: (err: any) => captureError('Job error', err, { name })
			});

			this.jobs.add(job);

			if (runImmediately) {
				if (waitUntilReady) {
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
				name,
				pattern,
				waitUntilReady,
				runImmediately,
			});
		}
	}

	public async registerEvents() {
		for await (const file of findFilesRecursivelyRegex(EVENTS_DIR, this._moduleFilePattern)) {
			const { default: mod }: EventModule = await import(file);

			const event    = new mod(this.container);
			const name     = event.name;
			const once     = event.once ?? false;
			const disabled = event.disabled ?? false;

			if (disabled) continue;
			if (this.events.has(name)) continue;
			if (once) {
				this.once(name, async (...args) => await event.handle(...args));
			} else {
				this.on(name, async (...args) => await event.handle(...args));
			}

			this.events.set(name, event);

			logger.info('Registered event', { name, once });
		}
	}

	public async registerCommands() {
		for await (const file of findFilesRecursivelyRegex(COMMANDS_DIR, this._moduleFilePattern)) {
			const { default: mod }: CommandModule = await import(file);
			const command = new mod(this.container);

			this.commands.set(command.name, command);

			logger.info('Registered command', { name: command.name });
		}
	}
}
