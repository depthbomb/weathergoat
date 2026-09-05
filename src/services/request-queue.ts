/** A bounded, process-wide queue for providers that require serialized requests. */
export class RequestQueue {
	private tail: Promise<unknown> = Promise.resolve();
	private pending = 0;
	private nextStart = 0;

	public constructor(
		private readonly intervalMs = 1_000,
		private readonly maxPending = 32,
		private readonly now = Date.now,
		private readonly sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
	) {}

	public defer(delayMs: number) {
		this.nextStart = Math.max(this.nextStart, this.now() + delayMs);
	}

	public run<T>(request: () => Promise<T>): Promise<T> {
		if (this.pending >= this.maxPending) {
			return Promise.reject(new Error('Geocoding is busy. Please try again later.'));
		}
		this.pending++;
		const result = this.tail.then(async () => {
			while (this.nextStart > this.now()) {
				if (this.nextStart - this.now() > 30_000) {
					throw new Error('Geocoding provider requested a cooldown. Please try again later.');
				}
				await this.sleep(this.nextStart - this.now());
			}
			this.nextStart = this.now() + this.intervalMs;
			return request();
		}).finally(() => { this.pending--; });
		this.tail = result.catch(() => {});
		return result;
	}
}
