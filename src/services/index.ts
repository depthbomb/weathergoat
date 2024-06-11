import { Collection } from 'discord.js';
import type { Awaitable } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

interface IServiceManager {
	/**
	 * @internal
	 */
	[kServices]: Collection<string, IService>;
	/**
	 * Registers a service.
	 * @param service An instance of {@link IService}.
	 */
	registerService(service: IService): IServiceManager;
	/**
	 * Calls the `init` method of all registered services if they implement it.
	 * @param client An instance of {@link WeatherGoat}.
	 */
	initializeServices(client: WeatherGoat<false>): Promise<void>;
	/**
	 * Calls the `init` method of all registered services if they implement it.
	 */
	destroyServices(): Promise<void>;
	all(): IService[];
}

export interface IService {
	/**
	 * The unique name of the service.
	 */
	name: string;
	/**
	 * If implemented, called early in the application boot.
	 *
	 * The calling of the services' `init` method is order agnostic so a service's `init` method
	 * should not rely on another service already being `init`'d.
	 *
	 * @param client An instance of {@link WeatherGoat}.
	 */
	init?(client: WeatherGoat<false>): Awaitable<unknown>;
	/**
	 * If implemented, called before the application exits.
	 */
	destroy?(): Awaitable<unknown>;
}

const kServices = Symbol('services');

export const serviceManager: IServiceManager = ({
	[kServices]: new Collection(),

	registerService(service) {
		if (this[kServices].has(service.name)) {
			throw new Error(`Service "${service.name}" has already been registered.`);
		}

		this[kServices].set(service.name, service);

		return this;
	},
	async initializeServices(client) {
		for (const [_, service] of this[kServices]) {
			await service.init?.(client);
		}
	},
	async destroyServices() {
		for (const [_, service] of this[kServices]) {
			await service.destroy?.();
		}
	},
	all() {
		return Array.from(this[kServices].values());
	}
});
