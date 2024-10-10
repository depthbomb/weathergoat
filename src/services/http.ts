import { fetch } from 'bun';
import { logger } from '@logger';
import { tokens } from '@container';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { joinURL, withQuery } from 'ufo';
import { BOT_USER_AGENT } from '@constants';
import { DurationFormatter } from '@sapphire/time-utilities';
import { retry, handleResultType, ConstantBackoff } from 'cockatiel';
import type { Logger } from 'winston';
import type { QueryObject } from 'ufo';
import type { IService } from '@services';
import type { RetryPolicy } from 'cockatiel';

type HttpClientOptions = {
	/**
	 * The name of this HTTP client.
	 */
	name: string;
	/**
	 * The base URL of requests the client makes.
	 */
	baseUrl?: string;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry?: boolean;
};
type CreateHttpClientOptions = Omit<HttpClientOptions, 'name'>;
type RequestOptions = RequestInit & { query?: QueryObject };
type GETOptions = Omit<RequestOptions, 'method'>;

export interface IHttpService extends IService {
	/**
	 * Retrieves an {@link HttpClient} instance, or creates one if it doesn't exist.
	 *
	 * @param name The name to identify the HTTP client.
	 * @param options Options to use when creating the HTTP client.
	 */
	getClient(name: string, options: CreateHttpClientOptions): HttpClient;
}

export class HttpClient {
	private readonly _name: string;
	private readonly _retry: boolean;
	private readonly _baseUrl?: string;
	private readonly _retryPolicy: RetryPolicy;
	private readonly _durationFormatter: DurationFormatter;
	private readonly _logger: Logger;

	private _requestNum = 0;

	public constructor(options: HttpClientOptions) {
		this._name = options?.name;
		this._retry = !!options?.retry;
		this._baseUrl = options?.baseUrl;
		this._retryPolicy = retry(handleResultType(Response, (res) => res.status > 399), {
			maxAttempts: 10,
			backoff: new ConstantBackoff(1_000)
		});
		this._durationFormatter = new DurationFormatter();
		this._logger = logger.child({ httpClient: this._name });
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

		let requestUrl = this._baseUrl ? joinURL(this._baseUrl, input) : input;

		if (init?.query) {
			requestUrl = withQuery(requestUrl, init.query);
		}

		const requestId = `${this._name}-${this._requestNum}`;

		this._logger.silly('Making HTTP request', { requestId, method: init?.method, url: requestUrl, retry: this._retry });

		const startTime = hrtime.bigint();

		let res: Response;
		if (this._retry) {
			res = await this._retryPolicy.execute(() => fetch(requestUrl, requestInit));
		} else {
			res = await fetch(requestUrl, requestInit);
		}

		const endTime = hrtime.bigint();

		this._logger.silly('Finished HTTP request', {
			requestId,
			status: `${res.status} - ${res.statusText}`,
			elapsed: this._durationFormatter.format(Number((endTime - startTime) / 1000000n))
		});

		this._requestNum++;

		return res;
	}
}

export default class HttpService implements IHttpService {
	private readonly _logger: Logger;
	private readonly _clients: Collection<string, HttpClient>;

	public constructor() {
		this._logger = logger.child({ service: tokens.http.description });
		this._clients = new Collection();
	}

	public getClient(name: string, options: CreateHttpClientOptions) {
		if (this._clients.has(name)) {
			return this._clients.get(name)!;
		}

		const { baseUrl, retry } = options;
		const client = new HttpClient({ name, baseUrl, retry });

		this._clients.set(name, client);

		this._logger.info('Created HTTP client', { name, ...options });

		return client;
	}
}
