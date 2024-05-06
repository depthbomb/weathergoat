import { logger } from '@lib/logger';
import { sleep } from '@sapphire/utilities';
import { AsyncQueue } from '@sapphire/async-queue';
import type { Awaitable } from 'discord.js';

type QueueableFunc = (...args: unknown[]) => Awaitable<unknown>;

export class Queue<T extends QueueableFunc> {
	private readonly _lock;
	private readonly _queue: Array<T>;
	private readonly _delay: number;

	public constructor(delay: number) {
		this._lock = new AsyncQueue();
		this._queue = [];
		this._delay = delay;
	}

	public enqueue(func: T) {
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
			logger.error(err);
		} finally {
			if (this._queue.length > 0) {
				await sleep(this._delay);
				this._lock.shift();
			}
		}
	}
}
