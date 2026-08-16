import { HTTPClient } from './http';
import { describe, expect, test } from 'bun:test';

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

describe('HTTP request cancellation', () => {
	test('aborts stalled requests at the configured deadline without retrying', async () => {
		const originalFetch = globalThis.fetch;
		let attempts = 0;

		try {
			globalThis.fetch = (async (_input, init) => {
				attempts++;
				return waitForAbort(init);
			}) as typeof fetch;

			const client = new HTTPClient({
				name: 'timeout-test',
				baseUrl: 'https://example.com',
				retry: true,
				timeoutMs: 10
			});
			let error: unknown;
			try {
				await client.get();
			} catch (err) {
				error = err;
			}

			expect(error).toBeInstanceOf(DOMException);
			expect((error as DOMException).name).toBe('TimeoutError');
			expect(attempts).toBe(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('combines the deadline with a caller-provided abort signal', async () => {
		const originalFetch = globalThis.fetch;
		const controller    = new AbortController();
		const reason        = new Error('caller cancelled');

		try {
			globalThis.fetch = (async (_input, init) => waitForAbort(init)) as typeof fetch;

			const client = new HTTPClient({
				name: 'caller-cancellation-test',
				baseUrl: 'https://example.com',
				retry: false,
				timeoutMs: 1_000
			});
			const request = client.get({ signal: controller.signal });

			controller.abort(reason);

			await expect(request).rejects.toBe(reason);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('rejects invalid timeout configuration', () => {
		expect(() => new HTTPClient({
			name: 'invalid-timeout-test',
			baseUrl: 'https://example.com',
			retry: false,
			timeoutMs: 0
		})).toThrow(RangeError);
	});
});
