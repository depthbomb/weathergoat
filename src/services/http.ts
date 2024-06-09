import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { joinURL, withQuery } from 'ufo';
import { init } from '@paralleldrive/cuid2';
import { BOT_USER_AGENT } from '@constants';
import { DurationFormatter } from '@sapphire/time-utilities';
import { retry, handleResultType, ExponentialBackoff } from 'cockatiel';
import type { QueryObject } from 'ufo';
import type { IService } from '@services';
import type { RetryPolicy } from 'cockatiel';

type HttpClientOptions = {
	/**
	 * The base URL of requests the client makes.
	 */
	baseUrl?: string;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry?: boolean;
};
type CreateHttpClientOptions = HttpClientOptions;
type RequestOptions = RequestInit & { query?: QueryObject };
type GETOptions = Omit<RequestOptions, 'method'>;

interface IHttpService extends IService {
	/**
	 * @internal
	 */
	[kClients]: Collection<string, HttpClient>;
	/**
	 * Retrieves an {@link HttpClient} instance, or creates one if it doesn't exist.
	 * @param name The name to identify the HTTP client.
	 * @param options Options to use when creating the HTTP client.
	 */
	getClient(name: string, options: CreateHttpClientOptions): HttpClient;
}

const kClients = Symbol('http-clients');

class HttpClient {
	private readonly _retry:             boolean;
	private readonly _baseUrl?:          string;
	private readonly _retryPolicy:       RetryPolicy;
	private readonly _generateId:        () => string;
	private readonly _durationFormatter: DurationFormatter;

	public constructor(options?: HttpClientOptions) {
		this._retry = !!options?.retry;
		this._baseUrl = options?.baseUrl;
		this._retryPolicy = retry(handleResultType(Response, (res) => res.status > 399), { maxAttempts: 10, backoff: new ExponentialBackoff() });
		this._generateId = init({ length: 6 });
		this._durationFormatter = new DurationFormatter();
	}

	public async get(url: string | URL, options?: GETOptions): Promise<Response> {
		return this._doRequest(url, { method: 'GET', ...options });
	}

	private async _doRequest(input: string | URL, init?: RequestOptions): Promise<Response> {
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

		const id = this._generateId();

		logger.http('Making HTTP request', {
			id,
			method: init?.method,
			url: requestUrl,
			retry: this._retry
		});

		const startTime = hrtime.bigint();

		let res: Response;
		if (this._retry) {
			res = await this._retryPolicy.execute(() => fetch(requestUrl, requestInit));
		} else {
			res = await fetch(requestUrl, requestInit);
		}

		const endTime = hrtime.bigint();

		logger.http('Finished HTTP request', {
			id,
			status: `${res.status} - ${res.statusText}`,
			elapsed: this._durationFormatter.format(Number((endTime - startTime) / 1000000n))
		});

		return res;
	}
}

export const httpService: IHttpService = ({
	name: 'com.services.http',

	[kClients]: new Collection(),

	getClient(name: string, options: CreateHttpClientOptions) {
		if (this[kClients].has(name)) {
			return this[kClients].get(name)!;
		}

		const { baseUrl, retry } = options;
		const client             = new HttpClient({ baseUrl, retry });

		this[kClients].set(name, client);

		return client;
	}
});
