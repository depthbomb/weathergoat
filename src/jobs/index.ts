import type { Cron } from 'croner';
import type { WeatherGoat } from '@client';

type JobOptions = {
	/**
	 * The unique name of the job.
	 */
	name: string;
	/**
	 * The cron pattern of the job.
	 */
	pattern: string;
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

export abstract class BaseJob {
	/**
	 * The unique name of the job.
	 */
	public readonly name: string;
	/**
	 * The cron pattern of the job.
	 */
	public readonly pattern: string;
	/**
	 * Whether to run the job immediately after it is registered regardless of whether the job
	 * should execute.
	 *
	 * Can be used in conjunction with {@link waitUntilReady} to run the job immediately after the
	 * client is ready.
	 */
	public readonly runImmediately: boolean;

	public constructor(options: JobOptions) {
		this.name = options.name;
		this.pattern = options.pattern;
		this.runImmediately = options.runImmediately ?? false;
	}

	/**
	 * Called when the job is scheduled to run.
	 *
	 * @param client The bot {@link WeatherGoat|client}.
	 * @param job The underlying {@link Cron} instance of the job.
	 */
	public abstract execute(client: WeatherGoat, job: Cron): Promise<unknown>;
}
