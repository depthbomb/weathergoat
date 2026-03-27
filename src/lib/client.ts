import { env } from '@env';
import { Cron } from 'croner';
import { join } from 'node:path';
import { Beacon } from './beacon';
import { container } from '@container';
import { DOMAINS_DIR } from '@constants';
import { inject } from '@needle-di/core';
import { DomainModuleKind } from '@domain';
import { Flag } from '@depthbomb/common/state';
import { RedisService } from '@services/redis';
import { stat, readdir } from 'node:fs/promises';
import { logger, reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { ResettableString } from './resettable-string';
import { compareComponentMatch } from '@infra/components';
import { findFilesRecursivelyRegex } from '@sapphire/node-utilities';
import {
	Client,
	Options,
	Partials,
	Collection,
	GatewayIntentBits,
	ApplicationCommandOptionType,
	chatInputApplicationCommandMention
} from 'discord.js';
import type { BaseJob } from '@infra/jobs';
import type { BaseEvent } from '@infra/events';
import type { ClientEvents } from 'discord.js';
import type { DomainDefinition } from '@domain';
import type { BaseCommand } from '@infra/commands';
import type { Maybe } from '@depthbomb/common/typing';
import type { BaseComponent, ComponentMatch } from '@infra/components';

type BaseModule<T>    = { default: new() => T };
type JobModule        = BaseModule<BaseJob>;
type EventModule      = BaseModule<BaseEvent<keyof ClientEvents>>;
type CommandModule    = BaseModule<BaseCommand>;
type ComponentModule  = BaseModule<BaseComponent>;
type DomainModule     = { default: DomainDefinition };
type RegisteredDomain = { definition: DomainDefinition; rootPath: string; };

export class WeatherGoat<T extends boolean = boolean> extends Client<T> {
	public readonly jobs                  = new Set<{ job: BaseJob; cron: Cron }>();
	public readonly events                = new Collection<string, BaseEvent<keyof ClientEvents>>();
	public readonly commands              = new Collection<string, BaseCommand>();
	public readonly components            = new Collection<string, BaseComponent>();
	public readonly maintenanceModeFlag   = new Flag(false);
	public readonly maintenanceModeReason = new ResettableString('No reason specified');
	public readonly commandLinks          = new Collection<string, string>();

	private commandLinksLoaded        = false;
	private commandLinksLoadPromise?: Promise<void>;

	private readonly beacon            = new Beacon();
	private readonly logger            = logger.child().withPrefix('[Client]');
	private readonly moduleFilePattern = /^(?!index\.ts$)(?!_)[\w-]+\.ts$/;

	public constructor(
		private readonly redis = inject(RedisService),
		private readonly features = inject(FeaturesService)
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
			partials: [Partials.Message, Partials.Channel],
			makeCache: Options.cacheWithLimits({
				...Options.DefaultMakeCacheSettings,
				ReactionManager: 0,
			})
		});
	}

	public async start() {
		await this.registerJobs();
		await this.registerEvents();
		await this.registerCommands();
		await this.registerComponents();

		const res = await this.login(env.get('BOT_TOKEN').release());

		await this.application?.fetch();

		this.beacon.install(this);

		return res;
	}

	public async destroy() {
		this.logger.info('Shutting down');

		for (const { cron } of this.jobs) {
			if (cron.isRunning()) {
				cron.stop();
			}
		}

		this.user?.setPresence({ status: 'invisible' });

		this.features.closeWatcher();
		this.redis.close();

		await super.destroy();
	}

	/**
	 * Iterates registered domain job directories and registers recurring background jobs, adding them to the
	 * container to utilize dependency injection.
	 */
	public async registerJobs() {
		for (const domain of await this.getRegisteredDomains()) {
			for await (const file of this.getDomainModuleFiles(domain, DomainModuleKind.Jobs)) {
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
					domain: domain.definition.id,
					name,
					pattern,
					runImmediately,
				}).info('Registered job');
			}
		}
	}

	/**
	 * Iterates registered domain event directories and registers client events.
	 */
	public async registerEvents() {
		for (const domain of await this.getRegisteredDomains()) {
			for await (const file of this.getDomainModuleFiles(domain, DomainModuleKind.Events)) {
				const { default: mod }: EventModule = await import(file);
				if (!container.has(mod)) {
					container.bind(mod);
				}

				const event    = container.get<BaseEvent<any>>(mod);
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

				this.logger.withMetadata({
					domain: domain.definition.id,
					name,
					once
				}).info('Registered event');
			}
		}
	}

	/**
	 * Iterates registered domain command directories and registers all commands, adding them to
	 * the container to utilize dependency injection.
	 */
	public async registerCommands() {
		this.commands.clear();
		this.commandLinks.clear();
		this.commandLinksLoaded      = false;
		this.commandLinksLoadPromise = undefined;

		const commandSourceByName = new Collection<string, string>();

		for (const domain of await this.getRegisteredDomains()) {
			for await (const file of this.getDomainModuleFiles(domain, DomainModuleKind.Commands)) {
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

				this.logger.withMetadata({
					domain: domain.definition.id,
					name: command.name
				}).info('Registered command');
			}
		}
	}

	public async getCommandLink(commandName: string, ...path: string[]) {
		const fullPath = this.formatCommandPath(commandName, ...path);
		const cached = this.commandLinks.get(fullPath);
		if (cached) {
			return cached;
		}

		if (!this.commandLinksLoaded) {
			await this.loadCommandLinksOnce();
			const loaded = this.commandLinks.get(fullPath);
			if (loaded) {
				return loaded;
			}
		}

		return `/${fullPath}`;
	}

	private async loadCommandLinks() {
		if (!this.application) {
			return;
		}

		const commands = await this.application.commands.fetch();
		for (const command of commands.values()) {
			const commandPath = this.formatCommandPath(command.name);
			this.commandLinks.set(commandPath, chatInputApplicationCommandMention(commandPath, command.id));

			for (const option of command.options) {
				if (option.type === ApplicationCommandOptionType.Subcommand) {
					const subcommandPath = this.formatCommandPath(command.name, option.name);
					this.commandLinks.set(subcommandPath, chatInputApplicationCommandMention(subcommandPath, command.id));
				} else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
					for (const subcommand of option.options ?? []) {
						if (subcommand.type === ApplicationCommandOptionType.Subcommand) {
							const groupedPath = this.formatCommandPath(command.name, option.name, subcommand.name);
							this.commandLinks.set(groupedPath, chatInputApplicationCommandMention(groupedPath, command.id));
						}
					}
				}
			}
		}

		this.commandLinksLoaded = true;
	}

	private async loadCommandLinksOnce() {
		if (this.commandLinksLoaded) {
			return;
		}

		this.commandLinksLoadPromise ??= this.loadCommandLinks();

		try {
			await this.commandLinksLoadPromise;
		} finally {
			this.commandLinksLoadPromise = undefined;
		}
	}

	private formatCommandPath(commandName: string, ...path: string[]) {
		return [commandName, ...path].join(' ');
	}

	/**
	 * Iterates registered domain component directories and registers component handlers,
	 * adding them to the container to utilize dependency injection.
	 */
	public async registerComponents() {
		this.components.clear();

		const componentSourceByName = new Collection<string, string>();

		for (const domain of await this.getRegisteredDomains()) {
			for await (const file of this.getDomainModuleFiles(domain, DomainModuleKind.Components)) {
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

				this.logger.withMetadata({
					domain: domain.definition.id,
					name: component.name
				}).info('Registered component');
			}
		}
	}

	public getComponentForCustomId(customId: string) {
		let best: Maybe<{ component: BaseComponent; match: ComponentMatch }>;

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

	private async getRegisteredDomains() {
		const entries = await readdir(DOMAINS_DIR, { withFileTypes: true });
		const seen    = new Set<string>();
		const domains = [] as RegisteredDomain[];

		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (!entry.isDirectory()) {
				continue;
			}

			const rootPath = join(DOMAINS_DIR, entry.name);
			const { default: definition }: DomainModule = await import(join(rootPath, 'index.ts'));
			if (definition.enabled === false) {
				continue;
			}

			if (seen.has(definition.id)) {
				throw new Error(`Duplicate domain id "${definition.id}" detected.`);
			}

			seen.add(definition.id);
			domains.push({
				definition,
				rootPath
			});
		}

		return domains;
	}

	private async *getDomainModuleFiles(domain: RegisteredDomain, kind: DomainModuleKind) {
		const directory = join(domain.rootPath, kind);
		if (!(await this.directoryExists(directory))) {
			return;
		}

		for await (const file of findFilesRecursivelyRegex(directory, this.moduleFilePattern)) {
			yield file;
		}
	}

	private async directoryExists(path: string) {
		try {
			const entry = await stat(path);
			return entry.isDirectory();
		} catch {
			return false;
		}
	}
}
