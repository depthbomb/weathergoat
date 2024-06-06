import { captureError } from '@lib/errors';
import { sleep } from '@sapphire/utilities';
import { AsyncQueue } from '@sapphire/async-queue';
import { Duration } from '@sapphire/time-utilities';
import type { Awaitable } from 'discord.js';

type QueueableFunc = (...args: unknown[]) => Awaitable<unknown>;
type QueueItem     = { fn: QueueableFunc, priority: boolean };

export class Queue {
	private _isRunning = false;

	private readonly _name: string;
	private readonly _lock: AsyncQueue;
	private readonly _queue: Array<QueueItem>;
	private readonly _delay: number;

	public constructor(name: string, delay: number | string) {
		this._name  = name;
		this._lock  = new AsyncQueue();
		this._queue = [];

		if (typeof delay === 'string') {
			this._delay = new Duration(delay).offset;
		} else {
			this._delay = delay;
		}
	}

	public get size() {
		return this._queue.length;
	}

	public clear() {
		while (this._queue.length) {
			this._queue.shift();
		}
	}

	public enqueue(fn: QueueableFunc, priority = false) {
		const item = { fn, priority };

		if (priority) {
			const idx = this._queue.findIndex(i => !i.priority);
			if (idx === -1) {
				this._queue.push(item);
			} else {
				this._queue.splice(idx, 0, item);
			}
		} else {
			this._queue.push(item);
		}

		if (!this._isRunning) {
			this._runNext();
		}
	}

	private async _runNext() {
		this._isRunning = true;

		await this._lock.wait();

		const { fn } = this._queue.shift()!;
		try {
			await fn();
		} catch (err: unknown) {
			captureError('Error running queued function', err, { queue: this._name });
		} finally {
			if (this._queue.length > 0) {
				await sleep(this._delay);
				this._lock.shift();
			}
		}

		this._isRunning = false;
	}
}
