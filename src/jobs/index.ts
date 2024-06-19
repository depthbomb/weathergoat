import type Cron from 'croner';
import type { BaseId } from '#types';
import type { WeatherGoat } from '@lib/client';

type JobId = `${BaseId<'jobs'>}.${string}`;
type JobOptions<WaitsUntilReady extends boolean = boolean> = {
	/**
	 * The unique name of the job.
	 */
	name: JobId;
	/**
	 * The cron pattern of the job.
	 */
	pattern: string;
	/**
	 * Whether the job should wait until the {@link WeatherGoat|client} is ready before being able
	 * to execute.
	 *
	 * `true` by default.
	 */
	waitUntilReady?: WaitsUntilReady;
	/**
	 * Whether to run the job immediately after it is registered regardless of whether the job
	 * should execute.
	 *
	 * Can be used in conjunction with {@link waitUntilReady} to run the job immediately after the
	 * client is ready.
	 *
	 * `false` by default.
	 */
	runImmediately?: boolean;
}

export abstract class BaseJob<WaitsUntilReady extends boolean = boolean> {
	public readonly name: JobId;
	public readonly pattern: string;
	public readonly waitUntilReady: boolean;
	public readonly runImmediately: boolean;

	public constructor(options: JobOptions<WaitsUntilReady>) {
		this.name = options.name;
		this.pattern = options.pattern;
		this.waitUntilReady = options.waitUntilReady ?? true;
		this.runImmediately = options.runImmediately ?? false;
	}

	public abstract execute(client: WeatherGoat<WaitsUntilReady>, job: Cron): Promise<unknown>;
}
