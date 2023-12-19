import { wait } from '@utils';
import { logger } from '@logger';
import { AsyncQueue } from '@sapphire/async-queue';
import { Duration } from '@sapphire/time-utilities';
import type { Logger } from 'tslog';
import type { Awaitable } from 'discord.js';

type Queueable = (...args: unknown[]) => Awaitable<any>;

export class Queue<T extends Queueable> {
	private readonly _delay: number;
	private readonly _queue: Array<T>;
	private readonly _lock: AsyncQueue;
	private readonly _logger: Logger;

	public constructor(name: string, delay: number | string) {
		if (typeof delay === 'number') {
			this._delay = delay;
		} else {
			this._delay = new Duration(delay).offset;
		}

		this._queue = [];
		this._lock  = new AsyncQueue();
		this._logger = logger.getChildLogger({ name });
	}

	public async enqueue(entry: T) {
		this._queue.push(entry);
		this._runNext();

		this._logger.debug('Enqueued entry', { entry });
	}

	private async _runNext() {
		if (!this._queue.length) {
			return;
		}

		await this._lock.wait();

		const entry = this._queue.shift()!;

		try {
			await entry();
		} catch (err) {
			this._logger.debug('Error calling queued entry', { entry, err });
		} finally {
			await wait(this._delay);
			this._lock.shift();
		}
	}
}
