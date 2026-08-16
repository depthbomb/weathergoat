import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { BOT_USER_AGENT } from '@constants';
import { injectable } from '@needle-di/core';
import { URLPath } from '@depthbomb/common/url';
import { isString, isUndefined } from '@depthbomb/common/guards';
import { formatDuration } from '@depthbomb/common/timing';
import { retry, ConstantBackoff, handleResultType } from 'cockatiel';
import type { LogLayer } from 'loglayer';
import type { RetryPolicy } from 'cockatiel';
import type { QueryObject } from '@depthbomb/common/url';

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
	 * Default tokens to replace in the base URL for requests this client makes.
	 */
	tokens?: Record<string, string | number | boolean>;
	/**
	 * Headers to include with every request this client makes.
	 */
	headers?: HeadersInit;
	/**
	 * Whether to use a retry policy to retry failed requests.
	 */
	retry: boolean;
	/**
	 * Maximum duration of each request attempt in milliseconds.
	 *
	 * @default 15000
	 */
	timeoutMs?: number;
};
type CreateHTTPClientOptions = Omit<HTTPClientOptions, 'name' | 'retry'> & {
	/**
	 * Whether to use a retry policy to retry failed requests.
	 *
	 * @default true
	 */
	retry?: boolean;
};
type RequestOptions = RequestInit & {
	query?: QueryObject;
	/**
	 * Tokens to replace in this request's resolved URL.
	 */
	tokens?: Record<string, string | number | boolean>;
};
type GETOptions     = Omit<RequestOptions, 'method'>;

const RETRYABLE_STATUS_CODES = new Set([
	408, // Request Timeout
	425, // Too Early
	429, // Too Many Requests
	500, // Internal Server Error
	502, // Bad Gateway
	503, // Service Unavailable
	504, // Gateway Timeout
]);
const DEFAULT_TIMEOUT_MS = 15_000;

export class HTTPClient {
	private readonly name: string;
	private readonly retry: boolean;
	private readonly timeoutMs: number;
	private readonly baseUrl?: string;
	private readonly tokens?: Record<string, string | number | boolean>;
	private readonly headers: Headers;
	private readonly retryPolicy: RetryPolicy;
	private readonly logger: LogLayer;

	private requestNum = 0;

	public constructor(options: HTTPClientOptions) {
		this.name        = options.name;
		this.retry       = options.retry;
		this.timeoutMs   = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.baseUrl     = options.baseUrl;
		this.tokens      = options.tokens;
		this.headers     = new Headers({ 'user-agent': BOT_USER_AGENT });
		this.retryPolicy = retry(handleResultType(Response, res => RETRYABLE_STATUS_CODES.has(res.status)), {
			maxAttempts: 10,
			backoff: new ConstantBackoff(1_500)
		});
		this.logger      = logger.child().withPrefix(`[HTTP(${this.name})]`);

		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
			throw new RangeError('HTTP client timeout must be a positive safe integer.');
		}

		this._mergeHeaders(this.headers, options.headers);
	}

	public async get(options?: GETOptions): Promise<Response>;
	public async get(url: string | URL, options?: GETOptions): Promise<Response>;
	public async get(urlOrOptions?: string | URL | GETOptions, options?: GETOptions) {
		if (isString(urlOrOptions) || urlOrOptions instanceof URL) {
			return this._doRequest(urlOrOptions, { method: 'GET', ...options });
		}

		return this._doRequest(undefined, { method: 'GET', ...(urlOrOptions ?? {}) });
	}

	private async _doRequest(input?: string | URL, init?: RequestOptions) {
		if (input instanceof URL) {
			input = input.toString();
		}

		const { query, tokens, ...initWithoutQuery } = init ?? {};
		const requestHeaders = new Headers(this.headers);
		this._mergeHeaders(requestHeaders, init?.headers);

		const requestInit: RequestInit = {
			...initWithoutQuery,
			headers: requestHeaders
		};

		const resolvedBaseUrl = this._resolveBaseUrl(tokens);
		let requestUrl: URLPath;
		if (input) {
			requestUrl = resolvedBaseUrl ? URLPath.from(input, resolvedBaseUrl) : URLPath.from(input);
		} else if (resolvedBaseUrl) {
			requestUrl = URLPath.from(resolvedBaseUrl);
		} else {
			throw new Error(`HTTP client "${this.name}" requires a request URL when no base URL is configured.`);
		}

		if (query) {
			requestUrl = requestUrl.withQuery(query);
		}

		const requestId = `${this.name}-${this.requestNum}`;

		this.logger.withMetadata({
			requestId,
			method: init?.method,
			url: requestUrl,
			retry: this.retry,
			timeoutMs: this.timeoutMs
		}).debug('Making HTTP request');

		const startTime = hrtime.bigint();

		const fetchRequest = () => requestUrl.fetch({
			...requestInit,
			signal: this._createRequestSignal(requestInit.signal)
		});
		let res: Response;
		if (this.retry) {
			res = await this.retryPolicy.execute(fetchRequest);
		} else {
			res = await fetchRequest();
		}

		const endTime = hrtime.bigint();

		this.logger.withMetadata({
			requestId,
			status: `${res.status} - ${res.statusText}`,
			elapsed: formatDuration(Number((endTime - startTime) / 1000000n))
		}).debug('Finished HTTP request');

		this.requestNum++;

		return res;
	}

	private _mergeHeaders(target: Headers, source?: HeadersInit) {
		if (!source) {
			return;
		}

		new Headers(source).forEach((value, key) => target.set(key, value));
	}

	private _createRequestSignal(callerSignal?: AbortSignal | null) {
		const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
		return callerSignal
			? AbortSignal.any([callerSignal, timeoutSignal])
			: timeoutSignal;
	}

	private _resolveBaseUrl(requestTokens?: Record<string, string | number | boolean>) {
		if (!this.baseUrl) {
			return;
		}

		const tokens = { ...this.tokens, ...requestTokens };

		return this.baseUrl.replaceAll(/\{([A-Za-z0-9_]+)\}/g, (_, tokenName: string) => {
			const value = tokens[tokenName];
			if (isUndefined(value)) {
				throw new Error(`Missing base URL token "${tokenName}" for HTTP client "${this.name}".`);
			}

			return String(value);
		});
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

		const retry         = options?.retry ?? true;
		const baseUrl       = options?.baseUrl;
		const headers       = options?.headers;
		const tokens        = options?.tokens;
		const timeoutMs     = options?.timeoutMs;
		const client        = new HTTPClient({ name, baseUrl, tokens, headers, retry, timeoutMs });

		this.clients.set(name, client);
		this.logger.withMetadata({ name, ...options }).info('Created HTTP client');

		return client;
	}
}
