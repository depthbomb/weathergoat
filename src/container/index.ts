import type { WeatherGoat } from '@client';
import type {
	IService,
	ICliService,
	IHttpService,
	ICacheService,
	IAlertsService,
	IGithubService,
	ISweeperService,
	IFeaturesService,
	IForecastService,
	ILocationService,
} from '@services';

type Service = {
	WeatherGoat: WeatherGoat;
	// Services
	Alerts: IAlertsService;
	Cache: ICacheService;
	Cli: ICliService;
	Features: IFeaturesService;
	Forecast: IForecastService;
	Github: IGithubService;
	Http: IHttpService;
	Location: ILocationService;
	Sweeper: ISweeperService;
};

type ServiceModule = new(container: Container) => IService;

class Container {
	private readonly _values: Map<string, unknown>;
	private readonly _modules: Map<string, ServiceModule>;
	private readonly _services: Map<string, IService>;

	public constructor() {
		this._values   = new Map();
		this._modules  = new Map();
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

	public register<Name extends keyof Service>(name: Name, serviceModule: unknown) {
		this._modules.set(name, serviceModule as ServiceModule);

		return this;
	}

	public registerValue<Name extends keyof Service>(name: Name, value: any) {
		this._values.set(name, value);

		return this;
	}

	public resolve<Name extends keyof Service, ResolvedService extends Service[Name]>(name: Name): ResolvedService {
		if (this._values.has(name)) {
			return this._values.get(name) as ResolvedService;
		}

		if (this._services.has(name)) {
			return this._services.get(name) as ResolvedService;
		}

		const mod = this._modules.get(name);
		if (!mod) {
			throw new Error(`Service not registered: ${name}`);
		}

		const service = new mod(this);

		this._services.set(name, service);

		return service as ResolvedService;
	}

	public async init() {
		for (const [_, service] of this._services) {
			await service.init?.();
		}
	}

	public async dispose() {
		for (const [_, service] of this._services) {
			await service.dispose?.();
		}
	}
}

export const container = new Container();
