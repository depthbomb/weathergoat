import type { IService } from '@services';

export * from './tokens';

type ServiceModule = new(container: Container) => IService;

export class Container {
	private readonly _values = new Map<string, unknown>();
	private readonly _modules = new Map<string, ServiceModule>();
	private readonly _services = new Map<string, IService>();

	public get services() {
		return this._services;
	}

	public get modules() {
		return this._modules;
	}

	public get values() {
		return this._values;
	}

	public register<T>(token: string, serviceModule: T) {
		this._modules.set(token, serviceModule as ServiceModule);

		return this;
	}

	public registerValue<T>(token: string, value: T) {
		this._values.set(token, value);

		return this;
	}

	public resolve<T>(token: string): T {
		if (this._values.has(token)) {
			return this._values as T;
		}

		if (this._services.has(token)) {
			return this._services.get(token) as T;
		}

		const mod = this._modules.get(token);
		if (!mod) {
			throw new Error(`Service not registered: ${token}`);
		}

		const service = new mod(this);

		this._services.set(token, service);

		return service as T;
	}

	public async dispose() {
		for (const [_, service] of this._services) {
			await service.dispose?.();
		}
	}
}
