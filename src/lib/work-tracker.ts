/** Fences new work before awaiting already accepted jobs and event handlers. */
export class WorkTracker {
	private closing = false;
	private readonly pending = new Set<Promise<unknown>>();

	public async run(work: () => Promise<unknown>) {
		if (this.closing) {
			return;
		}

		const execution = Promise.resolve().then(work);

		this.pending.add(execution);

		try {
			await execution;
		} finally {
			this.pending.delete(execution);
	}
	}

	public async closeAndDrain() {
		this.closing = true;
		await Promise.allSettled(this.pending);
	}
}
