import { db } from '@db';
import { Cron } from 'croner';
import initI18n from '@lib/i18n';
import { logger } from '@lib/logger';
import { init } from '@paralleldrive/cuid2';
import { Client, Collection } from 'discord.js';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR } from '@constants';
import { captureError, InvalidPermissionsError } from '@lib/errors';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import { isGuildBasedChannel, isGuildMember } from '@sapphire/discord.js-utilities';
import type { IJob } from '@jobs';
import type { IEvent } from '@events';
import type { ICommand } from '@commands';
import type { TextChannel, ClientEvents, ClientOptions, PermissionResolvable, ChatInputCommandInteraction } from 'discord.js';

type CommandModule = ICommand;
type EventModule   = IEvent<keyof ClientEvents>;
type JobModule     = IJob<boolean>;

export class WeatherGoat<T extends boolean> extends Client<T> {
	public readonly jobs: Set<JobModule>;
	public readonly events: Collection<string, EventModule>;
	public readonly commands: Collection<string, CommandModule>;
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
		await super.destroy();

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

	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not shave permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
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
			const module         = await import(file);
			const [moduleObject] = Object.keys(module);
			const job            = module[moduleObject] as JobModule;

			if (this.jobs.has(job)) continue;

			const name           = job.name;
			const pattern        = job.pattern;
			const runImmediately = job.runImmediately ?? false;
			const waitUntilReady = job.waitUntilReady ?? true;

			const j = Cron(pattern, async (self: Cron) => job.execute(this, self), {
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
			const module         = await import(file);
			const [moduleObject] = Object.keys(module);
			const event          = module[moduleObject] as EventModule;

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
			const module         = await import(file);
			const [moduleObject] = Object.keys(module);
			const command        = module[moduleObject] as CommandModule;
			const { name }       = command.data;

			this.commands.set(name, command);

			logger.info('Registered command', { name });
		}
	}
}
