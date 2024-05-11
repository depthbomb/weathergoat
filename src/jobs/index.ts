import type { Awaitable } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type Cron from 'croner';

type JobOptions = {
	name: string;
	pattern: string;
	waitUntilReady?: boolean;
	runImmediately?: boolean;
};

export abstract class Job {
	public readonly name: string;
	public readonly pattern: string;
	public readonly waitUntilReady: boolean;
	public readonly runImmediately: boolean;

	public constructor(options: JobOptions) {
		this.name           = options.name;
		this.pattern        = options.pattern;
		this.waitUntilReady = options.waitUntilReady ?? true;
		this.runImmediately = options.runImmediately ?? false;
	}

	public abstract execute(client: WeatherGoat<boolean>, job: Cron): Awaitable<any>;
}
