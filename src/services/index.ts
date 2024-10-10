import type { Container } from '@container';
import type { Awaitable } from 'discord.js';

export interface IService {
	/**
	 * If implemented, called right after all services have been registered.
	 *
	 * @param container The {@link Container} instance.
	 *
	 * @remark Because the service container is order-agnostic when it comes to registered services,
	 * a service's `init` method should not rely on another service being `init`'d.
	 */
	init?(container: Container): Awaitable<unknown>;
	/**
	 * If implemented, called before the application exits.
	 */
	dispose?(): Awaitable<unknown>;
}
