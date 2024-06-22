import type { IService } from '@services';

export * from './tokens';

type ServiceModule = new(container: Container) => IService;

export class Container {
	private readonly _dry: boolean;
	private readonly _values: Map<symbol, unknown>;
	private readonly _modules: Map<symbol, ServiceModule>;
	private readonly _services: Map<symbol, IService>;

	public constructor(dry: boolean) {
		this._dry = dry;
		this._values = new Map();
		this._modules = new Map();
		this._services = new Map();
	}

	public get services() {
		return this._services;
	}

	public get modules() {
		return this._modules;
	}

	public get values() {
		return this._values;
	}

	public register<T>(token: symbol, serviceModule: T) {
		this._modules.set(token, serviceModule as ServiceModule);

		return this;
	}

	public registerValue<T>(token: symbol, value: T) {
		this._values.set(token, value);

		return this;
	}

	public resolve<T>(token: symbol): T {
		if (this._values.has(token)) {
			return this._values as T;
		}

		if (this._services.has(token)) {
			return this._services.get(token) as T;
		}

		const mod = this._modules.get(token);
		if (!mod) {
			if (this._dry) {
				return null as T;
			}

			throw new Error(`Service not registered: ${token.toString()}`);
		}

		const service = new mod(this);

		this._services.set(token, service);

		return service as T;
	}

	public async init() {
		for (const [_, service] of this._services) {
			await service.init?.(this);
		}
	}

	public async dispose() {
		for (const [_, service] of this._services) {
			await service.dispose?.();
		}
	}
}
