import { logger } from '@lib/logger';
import { hrtime } from 'node:process';
import { Collection } from 'discord.js';
import { BOT_USER_AGENT } from '@constants';
import { injectable } from '@needle-di/core';
import { URLPath } from '@depthbomb/common/url';
import { formatDuration } from '@depthbomb/common/timing';
import { isString, isUndefined } from '@depthbomb/common/guards';
import type { LogLayer } from 'loglayer';
import type { QueryObject } from '@depthbomb/common/url';

export type HTTPRetryDelay = (delayMs: number, signal?: AbortSignal | null) => Promise<void>;
export type HTTPRetryOptions = {
	/** Total request attempts, including the initial request. */
	maxAttempts?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	multiplier?: number;
	/** Proportional randomization applied above and below the exponential delay. */
	jitterRatio?: number;
	retryStatusCodes?: Iterable<number>;
	shouldRetryError?: (error: unknown) => boolean;
	random?: () => number;
	sleep?: HTTPRetryDelay;
};
export type HTTPCacheValidators = {
	etag?: string;
	lastModified?: string;
};
export type HTTPBodyReadOptions = {
	maxBytes: number;
	contentTypes?: readonly string[];
};

type NormalizedHTTPRetryOptions = {
	maxAttempts: number;
	initialDelayMs: number;
	maxDelayMs: number;
	multiplier: number;
	jitterRatio: number;
	retryStatusCodes: ReadonlySet<number>;
	shouldRetryError: (error: unknown) => boolean;
	random: () => number;
	sleep: HTTPRetryDelay;
};
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
	 * Whether and how failed requests are retried.
	 */
	retry: boolean | HTTPRetryOptions;
	/**
	 * Maximum duration of each request attempt in milliseconds.
	 *
	 * @default 15000
	 */
	timeoutMs?: number;
};
type CreateHTTPClientOptions = Omit<HTTPClientOptions, 'name' | 'retry'> & {
	/**
	 * Whether and how failed requests are retried.
	 *
	 * @default true
	 */
	retry?: boolean | HTTPRetryOptions;
};
type RequestOptions = RequestInit & {
	query?: QueryObject;
	/** Cache validators to send when polling a previously retrieved resource. */
	validators?: HTTPCacheValidators;
	/**
	 * Tokens to replace in this request's resolved URL.
	 */
	tokens?: Record<string, string | number | boolean>;
};
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
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_MULTIPLIER = 2;
const DEFAULT_JITTER_RATIO = 0.2;

export class HTTPRequestError extends Error {
	public constructor(
		message: string,
		public readonly attempts: number,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = HTTPRequestError.name;
	}
}

export class HTTPResponseError extends Error {
	public constructor(
		message: string,
		public readonly response: Response
	) {
		super(message);
		this.name = HTTPResponseError.name;
	}
}

export class HTTPBodyTooLargeError extends HTTPResponseError {
	public constructor(response: Response, public readonly maxBytes: number) {
		super(`HTTP response body exceeded the ${maxBytes}-byte limit.`, response);
		this.name = HTTPBodyTooLargeError.name;
	}
}

export class HTTPContentTypeError extends HTTPResponseError {
	public constructor(response: Response, public readonly contentType: string | null) {
		super(`Unexpected HTTP response content type: ${contentType ?? '(missing)'}.`, response);
		this.name = HTTPContentTypeError.name;
	}
}

export class HTTPClient {
	private requestNum = 0;

	private readonly name: string;
	private readonly timeoutMs: number;
	private readonly retryOptions?: NormalizedHTTPRetryOptions;
	private readonly baseUrl?: string;
	private readonly tokens?: Record<string, string | number | boolean>;
	private readonly headers: Headers;
	private readonly logger: LogLayer;

	public constructor(options: HTTPClientOptions) {
		this.name         = options.name;
		this.timeoutMs    = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.retryOptions = options.retry === false ? undefined : normalizeRetryOptions(options.retry === true ? {} : options.retry);
		this.baseUrl      = options.baseUrl;
		this.tokens       = options.tokens;
		this.headers      = new Headers({ 'user-agent': BOT_USER_AGENT });
		this.logger       = logger.child().withPrefix(`[HTTP(${this.name})]`);

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

		const { query, tokens, validators, ...initWithoutQuery } = init ?? {};
		const requestHeaders = new Headers(this.headers);
		this._mergeHeaders(requestHeaders, init?.headers);
		applyCacheValidators(requestHeaders, validators);

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

		const requestId = `${this.name}-${this.requestNum++}`;

		this.logger.withMetadata({
			requestId,
			method: init?.method,
			url: this._getLogUrl(requestUrl),
			retry: Boolean(this.retryOptions),
			maxAttempts: this.retryOptions?.maxAttempts ?? 1,
			timeoutMs: this.timeoutMs
		}).debug('Making HTTP request');

		const startTime = hrtime.bigint();
		const res = await this._fetchWithRetries(requestUrl, requestInit);
		const endTime = hrtime.bigint();

		this.logger.withMetadata({
			requestId,
			status: `${res.status} - ${res.statusText}`,
			elapsed: formatDuration(Number((endTime - startTime) / 1000000n))
		}).debug('Finished HTTP request');

		return res;
	}

	private async _fetchWithRetries(requestUrl: URLPath, requestInit: RequestInit) {
		const callerSignal = requestInit.signal;
		const retryOptions = this.retryOptions;
		const maxAttempts = retryOptions?.maxAttempts ?? 1;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			if (callerSignal?.aborted) {
				throw callerSignal.reason;
			}

			try {
				const res = await requestUrl.fetch({
					...requestInit,
					signal: this._createRequestSignal(callerSignal)
				});

				if (!retryOptions || !retryOptions.retryStatusCodes.has(res.status) || attempt === maxAttempts) {
					return res;
				}

				await res.body?.cancel().catch(() => {});

				const delayMs = this._getRetryDelay(attempt, res.headers.get('retry-after'), retryOptions);
				await retryOptions.sleep(delayMs, callerSignal);
			} catch (error) {
				if (callerSignal?.aborted) {
					throw callerSignal.reason;
				}

				lastError = error;
				if (!retryOptions || attempt === maxAttempts || !retryOptions.shouldRetryError(error)) {
					throw new HTTPRequestError(`HTTP request failed after ${attempt} attempt${attempt === 1 ? '' : 's'}.`, attempt, { cause: error });
				}

				const delayMs = this._getRetryDelay(attempt, undefined, retryOptions);
				await retryOptions.sleep(delayMs, callerSignal);
			}
		}

		throw new HTTPRequestError(`HTTP request failed after ${maxAttempts} attempts.`, maxAttempts, { cause: lastError });
	}

	private _getRetryDelay(attempt: number, retryAfter: string | null | undefined, options: NormalizedHTTPRetryOptions) {
		const retryAfterMs = parseRetryAfter(retryAfter);
		if (!isUndefined(retryAfterMs)) {
			return Math.min(retryAfterMs, options.maxDelayMs);
		}

		const exponentialDelay = Math.min(
			options.maxDelayMs,
			options.initialDelayMs * options.multiplier ** (attempt - 1)
		);
		const jitterMultiplier = 1 - options.jitterRatio + options.random() * options.jitterRatio * 2;

		return Math.max(0, Math.round(exponentialDelay * jitterMultiplier));
	}

	private _mergeHeaders(target: Headers, source?: HeadersInit) {
		if (!source) {
			return;
		}

		new Headers(source).forEach((value, key) => target.set(key, value));
	}

	private _getLogUrl(requestUrl: URLPath) {
		const url = new URL(requestUrl.toString());

		return `${url.origin}${url.pathname}`;
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
	 * @param name The name to identify this HTTP client.
	 * @param options Options used when creating this client.
	 */
	public getClient(name: string, options?: CreateHTTPClientOptions) {
		if (this.clients.has(name)) {
			return this.clients.get(name)!;
		}

		const retry     = options?.retry ?? true;
		const baseUrl   = options?.baseUrl;
		const headers   = options?.headers;
		const tokens    = options?.tokens;
		const timeoutMs = options?.timeoutMs;
		const client    = new HTTPClient({ name, baseUrl, tokens, headers, retry, timeoutMs });

		this.clients.set(name, client);
		this.logger.withMetadata({ name, ...options }).info('Created HTTP client');

		return client;
	}
}

export function applyCacheValidators(headers: Headers, validators?: HTTPCacheValidators) {
	if (!validators) {
		return headers;
	}

	if (validators.etag && !headers.has('if-none-match')) {
		headers.set('if-none-match', validators.etag);
	}
	if (validators.lastModified && !headers.has('if-modified-since')) {
		headers.set('if-modified-since', validators.lastModified);
	}

	return headers;
}

export function getCacheValidators(response: Response): HTTPCacheValidators {
	const etag = response.headers.get('etag') ?? undefined;
	const lastModified = response.headers.get('last-modified') ?? undefined;

	return { etag, lastModified };
}

export function isNotModified(response: Response) {
	return response.status === 304;
}

export function parseRetryAfter(value: string | null | undefined, now = Date.now()) {
	if (!value) {
		return;
	}

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.ceil(seconds * 1_000);
	}

	const date = Date.parse(value);
	if (Number.isNaN(date)) {
		return;
	}

	return Math.max(0, date - now);
}

export async function readResponseBytes(response: Response, options: HTTPBodyReadOptions) {
	validateBodyReadOptions(options);
	assertContentType(response, options.contentTypes);

	const contentLength = response.headers.get('content-length');
	if (contentLength) {
		const declaredLength = Number(contentLength);
		if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
			throw new HTTPBodyTooLargeError(response, options.maxBytes);
		}
	}

	if (!response.body) {
		return new Uint8Array();
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			totalBytes += value.byteLength;
			if (totalBytes > options.maxBytes) {
				await reader.cancel();
				throw new HTTPBodyTooLargeError(response, options.maxBytes);
			}

			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return bytes;
}

export async function readResponseText(response: Response, options: HTTPBodyReadOptions) {
	const bytes = await readResponseBytes(response, options);

	return new TextDecoder().decode(bytes);
}

export async function readResponseJSON<T = unknown>(response: Response, options: Omit<HTTPBodyReadOptions, 'contentTypes'> & { contentTypes?: readonly string[] }) {
	const text = await readResponseText(response, {
		...options,
		contentTypes: options.contentTypes ?? ['application/json']
	});

	return JSON.parse(text) as T;
}

function normalizeRetryOptions(options: HTTPRetryOptions): NormalizedHTTPRetryOptions {
	const normalized: NormalizedHTTPRetryOptions = {
		maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
		initialDelayMs: options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
		maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
		multiplier: options.multiplier ?? DEFAULT_MULTIPLIER,
		jitterRatio: options.jitterRatio ?? DEFAULT_JITTER_RATIO,
		retryStatusCodes: new Set(options.retryStatusCodes ?? RETRYABLE_STATUS_CODES),
		shouldRetryError: options.shouldRetryError ?? isRetryableRequestError,
		random: options.random ?? Math.random,
		sleep: options.sleep ?? wait
	};

	if (!Number.isSafeInteger(normalized.maxAttempts) || normalized.maxAttempts < 1 || normalized.maxAttempts > 20) {
		throw new RangeError('HTTP retry maxAttempts must be a safe integer between 1 and 20.');
	}
	if (!Number.isFinite(normalized.initialDelayMs) || normalized.initialDelayMs < 0) {
		throw new RangeError('HTTP retry initialDelayMs must be a non-negative finite number.');
	}
	if (!Number.isFinite(normalized.maxDelayMs) || normalized.maxDelayMs < normalized.initialDelayMs) {
		throw new RangeError('HTTP retry maxDelayMs must be finite and at least initialDelayMs.');
	}
	if (!Number.isFinite(normalized.multiplier) || normalized.multiplier < 1) {
		throw new RangeError('HTTP retry multiplier must be a finite number of at least 1.');
	}
	if (!Number.isFinite(normalized.jitterRatio) || normalized.jitterRatio < 0 || normalized.jitterRatio > 1) {
		throw new RangeError('HTTP retry jitterRatio must be between 0 and 1.');
	}

	return normalized;
}

function isRetryableRequestError(error: unknown) {
	if (error instanceof DOMException) {
		return error.name === 'TimeoutError';
	}

	return error instanceof TypeError;
}

function assertContentType(response: Response, allowedContentTypes?: readonly string[]) {
	if (!allowedContentTypes?.length) {
		return;
	}

	const header = response.headers.get('content-type');
	const contentType = header?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
	const allowed = allowedContentTypes.some(value => value.toLowerCase() === contentType);
	if (!allowed) {
		throw new HTTPContentTypeError(response, contentType);
	}
}

function validateBodyReadOptions(options: HTTPBodyReadOptions) {
	if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
		throw new RangeError('HTTP response maxBytes must be a non-negative safe integer.');
	}
}

function wait(delayMs: number, signal?: AbortSignal | null) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}

		const timeout = setTimeout(finish, delayMs);
		const abort = () => finish(signal?.reason);
		signal?.addEventListener('abort', abort, { once: true });

		function finish(error?: unknown) {
			clearTimeout(timeout);
			signal?.removeEventListener('abort', abort);
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		}
	});
}
