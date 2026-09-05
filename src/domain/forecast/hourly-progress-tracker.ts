const HOUR_MS = 60 * 60 * 1_000;

export class HourlyProgressTracker<T> {
	private hourKey: number | null = null;
	private hourComplete = false;
	private readonly completed = new Set<T>();

	public begin(now: Date, items: Iterable<T> = []) {
		const hourKey = Math.floor(now.getTime() / HOUR_MS);
		if (hourKey !== this.hourKey) {
			this.hourKey = hourKey;
			this.hourComplete = false;
			this.completed.clear();
		}

		for (const item of items) {
			if (!this.completed.has(item)) {
				this.hourComplete = false;
				break;
			}
		}

		return !this.hourComplete;
	}

	public hasCompleted(item: T) {
		return this.completed.has(item);
	}

	public markCompleted(item: T) {
		this.completed.add(item);
	}

	public finish(items: Iterable<T>) {
		for (const item of items) {
			if (!this.completed.has(item)) {
				return false;
			}
		}

		this.hourComplete = true;
		return true;
	}
}
