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
	initializeServices(client: WeatherGoat<boolean>): Promise<void>;
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
	init?(client: WeatherGoat<boolean>): Awaitable<unknown>;
}

const kServices = Symbol('services');

export const serviceManager: IServiceManager = ({
	[kServices]: new Collection(),
	registerService(service: IService) {
		if (this[kServices].has(service.name)) {
			throw new Error(`Service "${service.name}" has already been registered.`);
		}

		this[kServices].set(service.name, service);

		return this;
	},
	async initializeServices(client: WeatherGoat<boolean>) {
		for (const [_, service] of this[kServices]) {
			await service.init?.(client);
		}
	}
});
