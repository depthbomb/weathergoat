import { fetch } from 'bun';
import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { joinURL, withQuery } from 'ufo';
import { BOT_USER_AGENT } from '@constants';
import { injectable } from '@needle-di/core';
import { DurationFormatter } from '@sapphire/duration';
import { retry, ConstantBackoff, handleResultType } from 'cockatiel';
import type { LogLayer } from 'loglayer';
import type { QueryObject } from 'ufo';
import type { RetryPolicy } from 'cockatiel';

type HTTPClientOptions = {
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
type CreateHTTPClientOptions = Omit<HTTPClientOptions, 'name' | 'retry'> & {
	/**
	 * Whether to use a retry policy to retry failed requests.
	 *
	 * @default true
	 */
	retry?: boolean;
};
type RequestOptions = RequestInit & { query?: QueryObject };
type GETOptions = Omit<RequestOptions, 'method'>;

const RETRYABLE_STATUS_CODES = new Set([
	408, // Request Timeout
	425, // Too Early
	429, // Too Many Requests
	500, // Internal Server Error
	502, // Bad Gateway
	503, // Service Unavailable
	504, // Gateway Timeout
]);

export class HTTPClient {
	private readonly name: string;
	private readonly retry: boolean;
	private readonly baseUrl?: string;
	private readonly retryPolicy: RetryPolicy;
	private readonly durationFormatter: DurationFormatter;
	private readonly logger: LogLayer;

	private requestNum = 0;

	public constructor(options: HTTPClientOptions) {
		this.name        = options.name;
		this.retry       = options.retry;
		this.baseUrl     = options.baseUrl;
		this.retryPolicy = retry(handleResultType(Response, res => RETRYABLE_STATUS_CODES.has(res.status)), {
			maxAttempts: 10,
			backoff: new ConstantBackoff(1_000)
		});
		this.durationFormatter = new DurationFormatter();
		this.logger            = logger.child().withPrefix(`[HTTP::${this.name}]`);
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

		this.logger.withMetadata({
			requestId,
			method: init?.method,
			url: requestUrl,
			retry: this.retry
		}).debug('Making HTTP request');

		const startTime = hrtime.bigint();

		let res: Response;
		if (this.retry) {
			res = await this.retryPolicy.execute(() => fetch(requestUrl, requestInit));
		} else {
			res = await fetch(requestUrl, requestInit);
		}

		const endTime = hrtime.bigint();

		this.logger.withMetadata({
			requestId,
			status: `${res.status} - ${res.statusText}`,
			elapsed: this.durationFormatter.format(Number((endTime - startTime) / 1000000n))
		}).debug('Finished HTTP request');

		this.requestNum++;

		return res;
	}
}

@injectable()
export class HTTPService {
	private readonly logger: LogLayer;
	private readonly clients: Collection<string, HTTPClient>;

	public constructor() {
		this.logger  = logger.child().withPrefix(HTTPService.name.bracketWrap());
		this.clients = new Collection();
	}

	/**
	 * Retrieves an {@link HTTPClient} instance, or creates one if it doesn't exist.
	 *
	 * @param name The name to identify the HTTP client.
	 * @param options Options to use when creating the HTTP client.
	 */
	public getClient(name: string, options?: CreateHTTPClientOptions) {
		if (this.clients.has(name)) {
			return this.clients.get(name)!;
		}

		const retry   = options?.retry ?? true;
		const baseUrl = options?.baseUrl;
		const client  = new HTTPClient({ name, baseUrl, retry });

		this.clients.set(name, client);
		this.logger.withMetadata({ name, ...options }).info('Created HTTP client');

		return client;
	}
}
