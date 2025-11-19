export type Token<T> = new (...args: any[]) => T;

export type Provider<T> =
	| { type: 'class'; value: new (c: Container) => T }
	| { type: 'factory'; value: (c: Container) => T }
	| { type: 'value'; value: T };

export class Container {
	private disposed  = false;
	private providers = new Map<Token<any>, Provider<any>>();
	private instances = new Map<Token<any>, any>();
	private edges     = new Map<Token<any>, Set<Token<any>>>();
	private resolving = new Set<Token<any>>();

	public getProviders() {
		return this.providers;
	}

	public registerClass<T>(ctor: new (c: Container) => T) {
		this.providers.set(ctor, { type: 'class', value: ctor });
		return this;
	}

	public registerFactory<T>(token: Token<T>, factory: (c: Container) => T) {
		this.providers.set(token, { type: 'factory', value: factory });
		return this;
	}

	public registerValue<T>(token: Token<T>, value: T) {
		this.providers.set(token, { type: 'value', value });
		this.instances.set(token, value);
		return this;
	}

	public resolve<T>(token: Token<T>): T;
	public resolve<T>(token: Token<T>, options: { lazy: true }): () => T;
	public resolve<T>(token: Token<T>, options?: { lazy?: boolean }): any {
		if (options?.lazy) {
			let cached: T | undefined;
			return () => (cached ??= this.resolve(token));
		}

		if (this.disposed) {
			throw new Error(`Cannot resolve '${token.name}'; container is disposed`);
		}

		if (this.instances.has(token)) {
			return this.instances.get(token);
		}

		if (this.resolving.has(token)) {
			const chain = [...this.resolving, token].map(t => t.name).join(' → ');
			throw new Error(`Cyclic dependency detected: ${chain}`);
		}

		const provider = this.providers.get(token);
		if (!provider) {
			throw new Error(`Service not registered: ${token.name}`);
		}

		this.resolving.add(token);
		const before = new Set(this.resolving);

		let instance: T;

		try {
			switch (provider.type) {
				case 'class':
					instance = new provider.value(this);
					break;
				case 'factory':
					instance = provider.value(this);
					break;
				case 'value':
					instance = provider.value;
					break;
			}
		} finally {
			this.resolving.delete(token);
		}

		const after = new Set(this.resolving);
		const deps = [...before]
			.filter(d => d !== token && !after.has(d))
			.filter(d => this.instances.has(d));

		this.edges.set(token, new Set(deps));
		this.instances.set(token, instance);

		return instance;
	}
}

export const container = new Container();
