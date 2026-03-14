import { env } from '@env';
import { Cron } from 'croner';
import { Flag } from './flag';
import { container } from '@container';
import { inject } from '@needle-di/core';
import { RedisService } from '@services/redis';
import { Client, Collection } from 'discord.js';
import { logger, reportError } from '@lib/logger';
import { compareComponentMatch } from '@components';
import { ResettableString } from './resettable-string';
import { Partials, GatewayIntentBits } from 'discord.js';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import { JOBS_DIR, EVENTS_DIR, COMMANDS_DIR, COMPONENTS_DIR } from '@constants';
import type { BaseJob } from '@jobs';
import type { BaseEvent } from '@events';
import type { BaseCommand } from '@commands';
import type { ClientEvents } from 'discord.js';
import type { BaseComponent, ComponentMatch } from '@components';

type BaseModule<T>   = { default: new() => T };
type JobModule       = BaseModule<BaseJob>;
type EventModule     = BaseModule<BaseEvent<keyof ClientEvents>>;
type CommandModule   = BaseModule<BaseCommand>;
type ComponentModule = BaseModule<BaseComponent>;

export class WeatherGoat<T extends boolean = boolean> extends Client<T> {
	public readonly jobs                  = new Set<{ job: BaseJob; cron: Cron }>();
	public readonly events                = new Collection<string, BaseEvent<keyof ClientEvents>>();
	public readonly commands              = new Collection<string, BaseCommand>();
	public readonly components            = new Collection<string, BaseComponent>();
	public readonly maintenanceModeFlag   = new Flag(false);
	public readonly maintenanceModeReason = new ResettableString('No reason specified');

	private readonly logger            = logger.child().withPrefix('[Client]');
	private readonly moduleFilePattern = /^(?!index\.ts$)(?!_)[\w-]+\.ts$/;

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
				GatewayIntentBits.GuildWebhooks,
				GatewayIntentBits.GuildScheduledEvents,
			],
			partials: [Partials.Message, Partials.Channel]
		});
	}

	public async start() {
		await this.registerJobs();
		await this.registerEvents();
		await this.registerCommands();
		await this.registerComponents();

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

			if (disabled) {
				continue;
			}

			if (this.events.has(name)) {
				continue;
			}

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

	/**
	 * Iterates the components directory and subdirectories and registers all component handlers,
	 * adding them to the container to utilize dependency injection.
	 */
	public async registerComponents() {
		this.components.clear();

		const componentSourceByName = new Map<string, string>();

		for await (const file of findFilesRecursivelyRegex(COMPONENTS_DIR, this.moduleFilePattern)) {
			const { default: mod }: ComponentModule = await import(file);
			if (!container.has(mod)) {
				container.bind(mod);
			}

			const component      = container.get<BaseComponent>(mod);
			const previousSource = componentSourceByName.get(component.name);
			if (previousSource) {
				throw new Error([
					`Duplicate component name "${component.name}" detected during registration.`,
					`First seen in: ${previousSource}`,
					`Duplicate found in: ${file}`
				].join('\n'));
			}

			this.components.set(component.name, component);

			componentSourceByName.set(component.name, file);

			this.logger.withMetadata({ name: component.name }).info('Registered component');
		}
	}

	public getComponentForCustomId(customId: string) {
		let best: { component: BaseComponent; match: ComponentMatch } | undefined;

		for (const component of this.components.values()) {
			const match = component.getMatch(customId);
			if (!match) {
				continue;
			}

			if (!best || compareComponentMatch(match, best.match) > 0) {
				best = { component, match };
			}
		}

		return best;
	}
}
