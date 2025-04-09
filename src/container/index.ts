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
	public readonly values: Map<string, unknown>;
	public readonly modules: Map<string, ServiceModule>;
	public readonly services: Map<string, IService>;

	public constructor() {
		this.values   = new Map();
		this.modules  = new Map();
		this.services = new Map();
	}

	public register<Name extends keyof Service>(name: Name, serviceModule: unknown) {
		this.modules.set(name, serviceModule as ServiceModule);

		return this;
	}

	public registerValue<Name extends keyof Service>(name: Name, value: any) {
		this.values.set(name, value);

		return this;
	}

	public resolve<Name extends keyof Service, ResolvedService extends Service[Name]>(name: Name): ResolvedService {
		if (this.values.has(name)) {
			return this.values.get(name) as ResolvedService;
		}

		if (this.services.has(name)) {
			return this.services.get(name) as ResolvedService;
		}

		const mod = this.modules.get(name);
		if (!mod) {
			throw new Error(`Service not registered: ${name}`);
		}

		const service = new mod(this);

		this.services.set(name, service);

		return service as ResolvedService;
	}

	public async init() {
		for (const [_, service] of this.services) {
			await service.init?.();
		}
	}

	public async dispose() {
		for (const [_, service] of this.services) {
			await service.dispose?.();
		}
	}
}

export const container = new Container();
