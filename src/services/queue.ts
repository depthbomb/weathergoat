import { sleep } from 'bun';
import { Collection } from 'discord.js';
import { captureError } from '@lib/errors';
import { AsyncQueue } from '@sapphire/async-queue';
import { Duration } from '@sapphire/time-utilities';
import type { IService } from '@services';
import type { Awaitable } from 'discord.js';

type Queueable = (...args: any[]) => Awaitable<unknown>;

interface IQueueService extends IService {
	queues: Collection<string, Queue>;
	createQueue(name: string, delay: string | number): Queue;
}

export class Queue<T extends Queueable = Queueable> {
	private readonly _name: string;
	private readonly _lock: AsyncQueue;
	private readonly _queue: Array<T>;
	private readonly _delay: number;

	public constructor(name: string, delay: number) {
		this._name  = name;
		this._lock  = new AsyncQueue();
		this._queue = [];
		this._delay = delay;
	}

	public get size() {
		return this._queue.length;
	}

	public clear() {
		while (this.size) {
			this._queue.shift();
		}
	}

	public enqueue(fn: T) {
		this._queue.push(fn);
		this._runNext();
	}

	private async _runNext() {
		await this._lock.wait();

		const fn = this._queue.shift()!;

		try {
			await fn();
		} catch (err: unknown) {
			captureError('Error running queued function', err, { queue: this._name });
		} finally {
			if (this.size > 0) {
				await sleep(this._delay);
				this._lock.shift();
			}
		}
	}
}

export const queueService: IQueueService = ({
	name: 'com.weathergoat.services.Queue',

	queues: new Collection(),

	createQueue(name, delay) {
		if (typeof delay === 'string') {
			delay = new Duration(delay).offset;
		} else {
			delay = delay;
		}

		return new Queue(name, delay);
	},
});
