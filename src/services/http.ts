import { fetch } from 'bun';
import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { joinURL, withQuery } from 'ufo';
import { BOT_USER_AGENT } from '@constants';
import { DurationFormatter } from '@sapphire/time-utilities';
import { retry, handleResultType, ConstantBackoff } from 'cockatiel';
import type { Logger } from 'winston';
import type { QueryObject } from 'ufo';
import type { RetryPolicy } from 'cockatiel';

type HttpClientOptions = {
	/**
	 * The name of this HTTP client.
	 */
	name: string;
	/**
	 * The base URL of requests the client makes.
	 *
	 * @default undefined
	 */
	baseUrl?: string;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry: boolean;
};
type CreateHttpClientOptions = Omit<HttpClientOptions, 'name' | 'retry'> & {
	/**
	 * Whether to use a retry policy to retry failed requests.
	 *
	 * @default true
	 */
	retry?: boolean;
};
type RequestOptions = RequestInit & { query?: QueryObject };
type GETOptions = Omit<RequestOptions, 'method'>;

export class HttpClient {
	private readonly name: string;
	private readonly retry: boolean;
	private readonly baseUrl?: string;
	private readonly retryPolicy: RetryPolicy;
	private readonly durationFormatter: DurationFormatter;
	private readonly logger: Logger;

	private requestNum = 0;

	public constructor(options: HttpClientOptions) {
		this.name        = options.name;
		this.retry       = options.retry;
		this.baseUrl     = options.baseUrl;
		this.retryPolicy = retry(handleResultType(Response, (res) => res.status > 399), {
			maxAttempts: 10,
			backoff: new ConstantBackoff(1_000)
		});
		this.durationFormatter = new DurationFormatter();
		this.logger            = logger.child({ httpClient: this.name });
	}

	public async get(url: string | URL, options?: GETOptions) {
		return this._doRequest(url, { method: 'GET', ...options });
	}

	private async _doRequest(input: string | URL, init?: RequestOptions) {
		if (typeof input !== 'string') {
			input = input.toString();
		}

		const requestInit = {
			...init,
			headers: {
				'user-agent': BOT_USER_AGENT,
				'accept': 'application/ld+json'
			},
		};

		let requestUrl = this.baseUrl ? joinURL(this.baseUrl, input) : input;

		if (init?.query) {
			requestUrl = withQuery(requestUrl, init.query);
		}

		const requestId = `${this.name}-${this.requestNum}`;

		this.logger.silly('Making HTTP request', { requestId, method: init?.method, url: requestUrl, retry: this.retry });

		const startTime = hrtime.bigint();

		let res: Response;
		if (this.retry) {
			res = await this.retryPolicy.execute(() => fetch(requestUrl, requestInit));
		} else {
			res = await fetch(requestUrl, requestInit);
		}

		const endTime = hrtime.bigint();

		this.logger.silly('Finished HTTP request', {
			requestId,
			status: `${res.status} - ${res.statusText}`,
			elapsed: this.durationFormatter.format(Number((endTime - startTime) / 1000000n))
		});

		this.requestNum++;

		return res;
	}
}

export class HttpService {
	private readonly logger: Logger;
	private readonly clients: Collection<string, HttpClient>;

	public constructor() {
		this.logger  = logger.child({ service: 'Http' });
		this.clients = new Collection();
	}

	/**
	 * Retrieves an {@link HttpClient} instance, or creates one if it doesn't exist.
	 *
	 * @param name The name to identify the HTTP client.
	 * @param options Options to use when creating the HTTP client.
	 */
	public getClient(name: string, options?: CreateHttpClientOptions) {
		if (this.clients.has(name)) {
			return this.clients.get(name)!;
		}

		const retry   = options?.retry ?? true;
		const baseUrl = options?.baseUrl;
		const client  = new HttpClient({ name, baseUrl, retry });

		this.clients.set(name, client);
		this.logger.info('Created HTTP client', { name, ...options });

		return client;
	}
}
