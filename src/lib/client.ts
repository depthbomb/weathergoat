import { env } from '@env';
import { Cron } from 'croner';
import { container } from '@container';
import { inject } from '@needle-di/core';
import { RedisService } from '@services';
import { Client, Collection } from 'discord.js';
import { logger, reportError } from '@lib/logger';
import { Partials, GatewayIntentBits } from 'discord.js';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR } from '@constants';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import type { BaseJob } from '@jobs';
import type { LogLayer } from 'loglayer';
import type { BaseEvent } from '@events';
import type { BaseCommand } from '@commands';
import type { ClientEvents } from 'discord.js';

type BaseModule<T> = { default: new() => T };
type JobModule     = BaseModule<BaseJob>;
type EventModule   = BaseModule<BaseEvent<keyof ClientEvents>>;
type CommandModule = BaseModule<BaseCommand>;

export class WeatherGoat<T extends boolean = boolean> extends Client<T> {
	public readonly jobs: Set<{ job: BaseJob; cron: Cron }>;
	public readonly events: Collection<string, BaseEvent<keyof ClientEvents>>;
	public readonly commands: Collection<string, BaseCommand>;

	private readonly logger: LogLayer;
	private readonly moduleFilePattern: RegExp;

	public constructor(
		private readonly redis = inject(RedisService)
	) {
		super({
			shards: 'auto',
			presence: {
				status: 'dnd'
			},
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildWebhooks
			],
			partials: [Partials.Message, Partials.Channel]
		});

		this.jobs     = new Set();
		this.events   = new Collection();
		this.commands = new Collection();

		this.logger            = logger.child().withPrefix('[Client]');
		this.moduleFilePattern = /^(?!index\.ts$)(?!_)[\w-]+\.ts$/;
	}

	public async start() {
		await this.registerJobs();
		await this.registerEvents();
		await this.registerCommands();

		const res = await this.login(env.get('BOT_TOKEN'));

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

		this.redis.close();

		await super.destroy();
	}

	/**
	 * Iterates the jobs directory and registers all recurring background jobs, adding them to the
	 * container to utilize dependency injection.
	 */
	public async registerJobs() {
		for await (const file of findFilesRecursivelyRegex(JOBS_DIR, this.moduleFilePattern)) {
			const { default: mod }: JobModule = await import(file);
			if (!container.has(mod)) {
				container.bind(mod);
			}

			const job            = container.get<BaseJob>(mod);
			const name           = job.name;
			const pattern        = job.pattern;
			const runImmediately = job.runImmediately ?? false;
			const cron = new Cron(pattern, async self => await job.execute(this, self), {
				name,
				paused: true,
				protect: (job) => this.logger.withMetadata({ name, calledAt: job.currentRun()?.getDate() }).warn('Job overrun'),
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

			this.logger.withMetadata({
				name,
				pattern,
				runImmediately,
			}).info('Registered job');
		}
	}

	/**
	 * Iterates the events directory and subdirectories and registers all client events. Event
	 * classes are not currently added to the container since none of them require any services.
	 */
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

			this.logger.withMetadata({ name, once }).info('Registered event');
		}
	}

	/**
	 * Iterates the commands directory and subdirectories and registers all commands, adding them to
	 * the container to utilize dependency injection.
	 */
	public async registerCommands() {
		this.commands.clear();

		const commandSourceByName = new Map<string, string>();

		for await (const file of findFilesRecursivelyRegex(COMMANDS_DIR, this.moduleFilePattern)) {
			const { default: mod }: CommandModule = await import(file);
			if (!container.has(mod)) {
				container.bind(mod);
			}

			const command        = container.get<BaseCommand>(mod);
			const previousSource = commandSourceByName.get(command.name);
			if (previousSource) {
				throw new Error([
					`Duplicate command name "${command.name}" detected during registration.`,
					`First seen in: ${previousSource}`,
					`Duplicate found in: ${file}`
				].join('\n'));
			}

			this.commands.set(command.name, command);

			commandSourceByName.set(command.name, file);

			this.logger.withMetadata({ name: command.name }).info('Registered command');
		}
	}
}
