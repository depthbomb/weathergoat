import { test, expect, describe } from 'bun:test';
import {
	HTTPClient,
	isNotModified,
	parseRetryAfter,
	HTTPRequestError,
	readResponseJSON,
	readResponseText,
	getCacheValidators,
	HTTPContentTypeError,
	HTTPBodyTooLargeError
} from './http';

function waitForAbort(init?: RequestInit) {
	return new Promise<Response>((_, reject) => {
		const signal = init?.signal;
		if (!signal) {
			reject(new Error('Expected request signal'));

			return;
		}

		const rejectWithReason = () => reject(signal.reason);
		if (signal.aborted) {
			rejectWithReason();
		} else {
			signal.addEventListener('abort', rejectWithReason, { once: true });
		}
	});
}

type FetchMock = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function withFetch(mockFetch: FetchMock, callback: () => Promise<void>) {
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = mockFetch as unknown as typeof fetch;
		await callback();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

describe('HTTP retries and cancellation', () => {
	test('retries attempt timeouts with a fresh deadline and an exact attempt bound', async () => {
		const signals: AbortSignal[] = [];
		let error: unknown;

		await withFetch((async (_input, init) => {
			signals.push(init!.signal!);

			return waitForAbort(init);
		}), async () => {
			const client = new HTTPClient({
				name: 'timeout-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 3,
					initialDelayMs: 0,
					maxDelayMs: 0,
					jitterRatio: 0
				},
				timeoutMs: 5
			});

			try {
				await client.get();
			} catch (err) {
				error = err;
			}
		});

		expect(error).toBeInstanceOf(HTTPRequestError);
		expect((error as HTTPRequestError).attempts).toBe(3);
		expect((error as HTTPRequestError).cause).toBeInstanceOf(DOMException);
		expect(((error as HTTPRequestError).cause as DOMException).name).toBe('TimeoutError');
		expect(signals).toHaveLength(3);
		expect(new Set(signals).size).toBe(3);
	});

	test('does not retry caller cancellation and preserves its reason', async () => {
		const controller = new AbortController();
		const reason = new Error('caller cancelled');
		let attempts = 0;

		await withFetch((async (_input, init) => {
			attempts++;

			return waitForAbort(init);
		}), async () => {
			const client = new HTTPClient({
				name: 'caller-cancellation-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 3,
					initialDelayMs: 0,
					maxDelayMs: 0
				},
				timeoutMs: 1_000
			});
			const request = client.get({ signal: controller.signal });

			controller.abort(reason);

			await expect(request).rejects.toBe(reason);
		});

		expect(attempts).toBe(1);
	});

	test('uses bounded exponential delays and returns the final response', async () => {
		const delays: number[] = [];
		let attempts = 0;

		await withFetch((async () => {
			attempts++;

			return new Response(null, { status: attempts < 3 ? 503 : 200 });
		}), async () => {
			const client = new HTTPClient({
				name: 'status-retry-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 3,
					initialDelayMs: 100,
					maxDelayMs: 1_000,
					jitterRatio: 0,
					sleep: async delay => { delays.push(delay); }
				}
			});

			expect((await client.get()).status).toBe(200);
		});

		expect(attempts).toBe(3);
		expect(delays).toEqual([100, 200]);
	});

	test('honors Retry-After delta seconds up to the configured delay bound', async () => {
		const delays: number[] = [];
		let attempts = 0;

		await withFetch((async () => {
			attempts++;

			return attempts === 1
				? new Response(null, { status: 429, headers: { 'retry-after': '12' } })
				: new Response(null, { status: 200 });
		}), async () => {
			const client = new HTTPClient({
				name: 'retry-after-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 2,
					initialDelayMs: 10,
					maxDelayMs: 5_000,
					sleep: async delay => { delays.push(delay); }
				}
			});

			await client.get();
		});

		expect(delays).toEqual([5_000]);
	});

	test('retries thrown network errors but returns the last handled status response', async () => {
		let networkAttempts = 0;
		await withFetch((async () => {
			networkAttempts++;
			throw new TypeError('connection reset');
		}), async () => {
			const client = new HTTPClient({
				name: 'network-retry-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 2,
					initialDelayMs: 0,
					maxDelayMs: 0
				}
			});

			await expect(client.get()).rejects.toMatchObject({ attempts: 2 });
		});
		expect(networkAttempts).toBe(2);

		let statusAttempts = 0;
		await withFetch((async () => {
			statusAttempts++;

			return new Response(null, { status: 503 });
		}), async () => {
			const client = new HTTPClient({
				name: 'status-exhaustion-test',
				baseUrl: 'https://example.com',
				retry: {
					maxAttempts: 2,
					initialDelayMs: 0,
					maxDelayMs: 0
				}
			});

			expect((await client.get()).status).toBe(503);
		});
		expect(statusAttempts).toBe(2);
	});

	test('rejects invalid timeout and retry configuration', () => {
		expect(() => new HTTPClient({
			name: 'invalid-timeout-test',
			baseUrl: 'https://example.com',
			retry: false,
			timeoutMs: 0
		})).toThrow(RangeError);
		expect(() => new HTTPClient({
			name: 'invalid-retry-test',
			baseUrl: 'https://example.com',
			retry: { maxAttempts: 0 }
		})).toThrow(RangeError);
	});
});

describe('HTTP cache validators', () => {
	test('sends validators without replacing explicit request headers and exposes 304', async () => {
		const observed: Array<string | null> = [];

		await withFetch((async (_input, init) => {
			const headers = new Headers(init?.headers);
			observed.push(headers.get('if-none-match'), headers.get('if-modified-since'));

			return new Response(null, {
				status: 304,
				headers: {
					etag: '"revision-2"',
					'last-modified': 'Wed, 27 Aug 2026 12:00:00 GMT'
				}
			});
		}), async () => {
			const client = new HTTPClient({
				name: 'validator-test',
				baseUrl: 'https://example.com',
				retry: true
			});
			const response = await client.get({
				headers: { 'if-none-match': '"explicit"' },
				validators: {
					etag: '"cached"',
					lastModified: 'Tue, 26 Aug 2026 12:00:00 GMT'
				}
			});

			expect(isNotModified(response)).toBeTrue();
			expect(getCacheValidators(response)).toEqual({
				etag: '"revision-2"',
				lastModified: 'Wed, 27 Aug 2026 12:00:00 GMT'
			});
		});

		expect(observed).toEqual(['"explicit"', 'Tue, 26 Aug 2026 12:00:00 GMT']);
	});

	test('parses delta-second and HTTP-date Retry-After values', () => {
		const now = Date.parse('2026-08-27T12:00:00Z');

		expect(parseRetryAfter('1.5', now)).toBe(1_500);
		expect(parseRetryAfter('Thu, 27 Aug 2026 12:00:03 GMT', now)).toBe(3_000);
		expect(parseRetryAfter('invalid', now)).toBeUndefined();
	});
});

describe('bounded HTTP response bodies', () => {
	test('reads JSON only for an allowed content type', async () => {
		const response = new Response('{"value":42}', {
			headers: { 'content-type': 'application/geo+json; charset=utf-8' }
		});

		expect(await readResponseJSON<{ value: number }>(response, {
			maxBytes: 64,
			contentTypes: ['application/geo+json']
		})).toEqual({ value: 42 });
	});

	test('rejects unexpected content types', async () => {
		const response = new Response('<html></html>', {
			headers: { 'content-type': 'text/html' }
		});

		await expect(readResponseText(response, {
			maxBytes: 64,
			contentTypes: ['application/json']
		})).rejects.toBeInstanceOf(HTTPContentTypeError);
	});

	test('rejects declared and streamed bodies over the limit', async () => {
		const declared = new Response('large', {
			headers: { 'content-length': '100' }
		});
		await expect(readResponseText(declared, { maxBytes: 10 })).rejects.toBeInstanceOf(HTTPBodyTooLargeError);

		const streamed = new Response(new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(8));
				controller.enqueue(new Uint8Array(8));
				controller.close();
			}
		}));
		await expect(readResponseText(streamed, { maxBytes: 10 })).rejects.toBeInstanceOf(HTTPBodyTooLargeError);
	});
});
