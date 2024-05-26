import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { joinURL, withQuery } from 'ufo';
import { init } from '@paralleldrive/cuid2';
import { BOT_USER_AGENT } from '@constants';
import { DurationFormatter } from '@sapphire/time-utilities';
import { retry, handleResultType, ExponentialBackoff } from 'cockatiel';
import type { QueryObject } from 'ufo';
import type { RetryPolicy } from 'cockatiel';

type CreateHttpClientOptions = {
	/**
	 * The base URL of requests the client makes.
	 */
	baseUrl?: string;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry?: boolean;
};
type RequestOptions = RequestInit & { query?: QueryObject };
type GETOptions  = Omit<RequestOptions, 'method'>;

export class HttpClient {
	private readonly _retry:             boolean;
	private readonly _baseUrl?:          string;
	private readonly _retryPolicy:       RetryPolicy;
	private readonly _generateId:        () => string;
	private readonly _durationFormatter: DurationFormatter;

	public constructor(options?: CreateHttpClientOptions) {
		this._retry = !!options?.retry;
		this._baseUrl = options?.baseUrl;
		this._retryPolicy = retry(handleResultType(Response, (res) => res.status !== 200), { maxAttempts: 10, backoff: new ExponentialBackoff() });
		this._generateId = init({ length: 6 });
		this._durationFormatter = new DurationFormatter()
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

		let res: Promise<Response>;
		if (this._retry) {
			res = this._retryPolicy.execute(() => fetch(requestUrl, requestInit));
		} else {
			res = fetch(requestUrl, requestInit);
		}

		const endTime = hrtime.bigint();

		logger.http('Finished HTTP request', {
			id,
			method: init?.method,
			url: requestUrl,
			retry: this._retry,
			elapsed: this._durationFormatter.format(Number((endTime - startTime) / 1000000n))
		});

		return res;
	}
}
