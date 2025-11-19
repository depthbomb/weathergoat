import { db } from '@db';
import initI18n from '@i18n';
import { Cron } from 'croner';
import { logger, reportError } from '@logger';
import { Client, Collection } from 'discord.js';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR } from '@constants';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import type { BaseJob } from '@jobs';
import type { Logger } from 'winston';
import type { BaseEvent } from '@events';
import type { BaseCommand } from '@commands';
import type { ClientEvents, ClientOptions } from 'discord.js';

type BaseModule<T> = { default: new() => T };
type JobModule = BaseModule<BaseJob>;
type EventModule = BaseModule<BaseEvent<keyof ClientEvents>>;
type CommandModule = BaseModule<BaseCommand>;

type WeatherGoatOptions = ClientOptions & {}

export class WeatherGoat<T extends boolean = boolean> extends Client<T> {
	public readonly jobs: Set<{ job: BaseJob; cron: Cron }>;
	public readonly events: Collection<string, BaseEvent<keyof ClientEvents>>;
	public readonly commands: Collection<string, BaseCommand>;

	private readonly logger: Logger;
	private readonly moduleFilePattern: RegExp;

	public constructor(options: WeatherGoatOptions) {
		super(options);

		this.jobs     = new Set();
		this.events   = new Collection();
		this.commands = new Collection();

		this.logger = logger.child({ logger: 'WeatherGoat' });
		this.moduleFilePattern = /^(?!index\.ts$)(?!_)[\w-]+\.ts$/;
	}

	public async login(token?: string | undefined) {
		await initI18n();
		await this.registerJobs();
		await this.registerEvents();
		await this.registerCommands();

		const res = await super.login(token);

		await this.application?.fetch();

		return res;
	}

	public async destroy() {
		this.logger.info('Shutting down');

		for (const { cron } of this.jobs) {
			if (cron.isRunning()) {
				cron.stop();
			}
		}

		await db.$disconnect();
		await super.destroy();

		if (!logger.closed) {
			logger.close();
		}
	}

	public async registerJobs() {
		for await (const file of findFilesRecursivelyRegex(JOBS_DIR, this.moduleFilePattern)) {
			const { default: mod }: JobModule = await import(file);

			const job            = new mod();
			const name           = job.name;
			const pattern        = job.pattern;
			const runImmediately = job.runImmediately ?? false;
			const cron = new Cron(pattern, async self => await job.execute(this, self), {
				name,
				paused: true,
				protect: (job) => this.logger.warn('Job overrun', { name, calledAt: job.currentRun()?.getDate() }),
				catch: (err) => reportError('Job error', err, { name })
			});

			this.jobs.add({ job, cron });

			this.once('clientReady', async () => {
				try {
					if (runImmediately) {
						await job.execute(this, cron);
					}
				} catch (err) {
					reportError('Error executing `runImmediately` job', err, { name });
				} finally {
					cron.resume();
				}
			});

			this.logger.info('Registered job', {
				name,
				pattern,
				runImmediately,
			});
		}
	}

	public async registerEvents() {
		for await (const file of findFilesRecursivelyRegex(EVENTS_DIR, this.moduleFilePattern)) {
			const { default: mod }: EventModule = await import(file);

			const event    = new mod();
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

			this.logger.info('Registered event', { name, once });
		}
	}

	public async registerCommands() {
		for await (const file of findFilesRecursivelyRegex(COMMANDS_DIR, this.moduleFilePattern)) {
			const { default: mod }: CommandModule = await import(file);
			const command = new mod();

			this.commands.set(command.name, command);

			this.logger.info('Registered command', { name: command.name });
		}
	}
}
