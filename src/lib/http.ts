import { joinURL, withQuery } from 'ufo';
import { BOT_USER_AGENT, BROWSER_USER_AGENT } from '@constants';
import { retry, handleResultType, ExponentialBackoff } from 'cockatiel';
import type { QueryObject } from 'ufo';
import type { RetryPolicy } from 'cockatiel';

type CreateHttpClientOptions = {
	/**
	 * The base URL of requests the client makes.
	 */
	baseUrl?: string;
	/**
	 * Whether to mimick a browser user agent when sending requests.
	 */
	useBrowserUserAgent?: boolean;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry?: boolean;
};
type RequestOptions = RequestInit & { query?: QueryObject };
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
		this._userAgent   = options?.useBrowserUserAgent ? BROWSER_USER_AGENT : BOT_USER_AGENT;
		this._retryPolicy = retry(handleResultType(Response, (res) => res.status !== 200), { maxAttempts: 10, backoff: new ExponentialBackoff() });
	}

	public async get(url: string | URL, options?: GETOptions): Promise<Response> {
		return this._doRequest(url, { method: 'GET', ...options });
	}

	public async post(url: string | URL, options?: POSTOptions): Promise<Response> {
		return this._doRequest(url, { method: 'POST', ...options });
	}

	// rewrite the function below to add retry logic please. you may proceed:

	private async _doRequest(input: string | URL, init?: RequestOptions): Promise<Response> {
		if (typeof input !== 'string') {
			input = input.toString();
		}

		const requestInit = {
			...init,
			headers: {
				'user-agent': this._userAgent,
				'accept': 'application/ld+json'
			},
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