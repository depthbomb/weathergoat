import { logger } from '@lib/logger';
import { isNull } from '@depthbomb/common/guards';
import { parseDuration } from '@depthbomb/common/timing';
import type { LogLayer } from 'loglayer';
import type { WeatherGoat } from '@lib/client';
import type { Nullable } from '@depthbomb/common/typing';

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

	private _nextRun: Date;
	private _lastRun: Nullable<Date> = null;

	public constructor(options: JobOptions) {
		this.name           = options.name;
		this.interval       = options.interval;
		this.runImmediately = options.runImmediately ?? false;
		this.logger         = logger.child().withPrefix(`[Job(${this.name})]`);

		this._nextRun = parseDuration(this.interval).fromNow();
	}

	/**
	 * The {@link Date} that the job will run.
	 */
	public get nextRun() {
		return this._nextRun;
	}

	/**
	 * The {@link Date} that the job last ran at.
	 */
	public get lastRun() {
		return this._lastRun;
	}

	/**
	 * The number of milliseconds from the last interval in which the job will run.
	 */
	public get nextRunMs() {
		return isNull(this.nextRun) ? parseDuration(this.interval).toMilliseconds() : this.nextRun?.getTime() - Date.now();
	}

	/**
	 * Called when the job is scheduled to run.
	 *
	 * @param client The bot {@link WeatherGoat|client}.
	 * @param job The underlying {@link Cron} instance of the job.
	 */
	public abstract execute(client: WeatherGoat): Promise<void>;

	/**
	 *
	 *
	 * @param client The bot {@link WeatherGoat|client}.
	 * @internal
	 */
	public callExecute(client: WeatherGoat) {
		const parsedDuration = parseDuration(this.interval);

		this.execute(client);

		this._lastRun = new Date();
		this._nextRun = parsedDuration.fromNow();
	}
}
