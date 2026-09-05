import { expect, test } from 'bun:test';
import { WorkTracker } from './work-tracker';

test('drain waits for accepted work and fences jobs/events arriving afterward', async () => {
	const tracker = new WorkTracker();
	let release!: () => void;
	const hold = new Promise<void>(resolve => { release = resolve; });
	let calls = 0;
	const running = tracker.run(async () => { calls++; await hold; });
	let drained = false;
	const drain = tracker.closeAndDrain().then(() => { drained = true; });
	await tracker.run(async () => { calls++; });
	expect(calls).toBe(1);
	expect(drained).toBe(false);
	release();
	await Promise.all([running, drain]);
	expect(drained).toBe(true);
	await tracker.run(async () => { calls++; });
	expect(calls).toBe(1);
});

test('failed handlers release their drain slot', async () => {
	const tracker = new WorkTracker();
	const operation = tracker.run(async () => { throw new Error('handler failed'); });
	await expect(operation).rejects.toThrow('handler failed');
	await tracker.closeAndDrain();
});
