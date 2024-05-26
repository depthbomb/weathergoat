import { captureError } from '@lib/errors';
import { sleep } from '@sapphire/utilities';
import { AsyncQueue } from '@sapphire/async-queue';
import { Duration } from '@sapphire/time-utilities';
import type { Awaitable } from 'discord.js';

type QueueableFunc = (...args: unknown[]) => Awaitable<unknown>;

export class Queue {
	private readonly _name: string;
	private readonly _lock: AsyncQueue;
	private readonly _queue: Array<QueueableFunc>;
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

	public enqueue(func: QueueableFunc) {
		this._queue.push(func);
		this._runNext()
	}

	private async _runNext() {
		if (!this._queue.length) {
			return;
		}

		await this._lock.wait();

		const func = this._queue.shift()!;
		try {
			await func();
		} catch (err: unknown) {
			captureError('Error running queued function', err, { name: this._name });
		} finally {
			if (this._queue.length > 0) {
				await sleep(this._delay);
				this._lock.shift();
			}
		}
	}
}
