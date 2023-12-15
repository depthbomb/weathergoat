import { joinURL, withQuery } from 'ufo';
import { retry, handleAll, ExponentialBackoff } from 'cockatiel';
import type { QueryObject } from 'ufo';
import type { RetryPolicy } from 'cockatiel';

type CreateHttpClientOptions = {
	/**
	 * The base URL of requests the client makes.
	 */
	baseUrl?: string;
	/**
	 * The user agent to send with requests using this client.
	 */
	userAgent?: string;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry?: boolean;
}

type RequestOptions = RequestInit & {
	query?: QueryObject
}
type GETOptions  = Omit<RequestOptions, 'method'>;
type POSTOptions = GETOptions;

export class HttpClient {
	private readonly _retry:       boolean;
	private readonly _userAgent:   string;
	private readonly _baseUrl?:    string;
	private readonly _retryPolicy: RetryPolicy;

	public constructor(options?: CreateHttpClientOptions) {
		this._retry       = !!options?.retry;
		this._baseUrl     = options?.baseUrl;
		this._userAgent   = options?.userAgent ?? `WeatherGoat/${__VERSION__}/${__BUILD_HASH__} Node.js/${process.version}`;
		this._retryPolicy = retry(handleAll, { maxAttempts: 15, backoff: new ExponentialBackoff() });
	}

	public async get(url: string | URL, options?: GETOptions): Promise<Response> {
		return this._doRequest(url, { method: 'GET', ...options });
	}

	public async post(url: string | URL, options?: POSTOptions): Promise<Response> {
		return this._doRequest(url, { method: 'POST', ...options });
	}

	private async _doRequest(input: string | URL, init?: RequestOptions): Promise<Response> {
		if (typeof input !== 'string') {
			input = input.toString();
		}

		const requestInit = {
			headers: {
				'user-agent': this._userAgent,
				'accept': 'application/ld+json'
			},
			...init
		};

		let requestUrl = this._baseUrl ? joinURL(this._baseUrl, input) : input;

		if (init?.query) {
			requestUrl = withQuery(requestUrl, init.query);
		}

		if (this._retry) {
			return this._retryPolicy.execute(() => fetch(requestUrl, requestInit));
		}

		return fetch(requestUrl, requestInit);
	}
}
