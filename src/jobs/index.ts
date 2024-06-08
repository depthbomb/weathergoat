import type Cron from 'croner';
import type { Awaitable } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export interface IJob<WaitUntilReady extends boolean = true> {
	/**
	 * The unique name of the job.
	 */
	name: string;
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
	waitUntilReady?: WaitUntilReady;
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
	/**
	 * The method called when the job should execute.
	 * @param client An instance of {@link WeatherGoat}.
	 * @param job The underlying {@link Cron} job.
	 */
	execute(client: WeatherGoat<WaitUntilReady>, job: Cron): Awaitable<unknown>;
}
