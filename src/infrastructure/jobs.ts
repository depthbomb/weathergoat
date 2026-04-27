import { logger } from '@lib/logger';
import type { Cron } from 'croner';
import type { LogLayer } from 'loglayer';
import type { WeatherGoat } from '@lib/client';

type JobOptions = {
	/**
	 * The unique name of the job.
	 */
	name: string;
	/**
	 * The interval that the job runs at in duration format.
	 */
	interval: string;
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
};

export abstract class BaseJob {
	/**
	 * The unique name of the job.
	 */
	public readonly name: string;
	/**
	 * The interval that the job runs at in duration format.
	 */
	public readonly interval: string;
	/**
	 * Whether to run the job immediately after it is registered regardless of whether the job
	 * should execute.
	 *
	 * Can be used in conjunction with {@link waitUntilReady} to run the job immediately after the
	 * client is ready.
	 */
	public readonly runImmediately: boolean;
	/**
	 * A {@link LogLayer} instance.
	 */
	public readonly logger: LogLayer;

	public constructor(options: JobOptions) {
		this.name           = options.name;
		this.interval       = options.interval;
		this.runImmediately = options.runImmediately ?? false;
		this.logger         = logger.child().withPrefix(`[Job(${this.name})]`);
	}

	/**
	 * Called when the job is scheduled to run.
	 *
	 * @param client The bot {@link WeatherGoat|client}.
	 * @param job The underlying {@link Cron} instance of the job.
	 */
	public abstract execute(client: WeatherGoat): Promise<void>;
}
