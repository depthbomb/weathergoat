import EventEmitter from 'node:events';
import { injectable } from '@needle-di/core';
import type { Awaitable } from '@depthbomb/common/types';

type Events = {
	'alert-destinations:updated': [void];
};

@injectable()
export class EventBusService extends EventEmitter<Events> {
	public async emitAsync<K extends keyof Events>(eventName: K, ...args: Events[K]) {
		const listeners = this.rawListeners(eventName) as Array<(...params: Events[K]) => Awaitable<unknown>>;
		return Promise.allSettled(
			listeners.map(listener => Promise.resolve().then(() => listener.apply(this, args)))
		);
	}
}
