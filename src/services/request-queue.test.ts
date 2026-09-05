import { expect, test } from 'bun:test';
import { RequestQueue } from './request-queue';

test('serializes bursts, respects provider deferral and recovers after failure', async () => {
	let now = 0;
	const starts: number[] = [];
	const queue = new RequestQueue(1000, 3, () => now, async ms => { now += ms; });
	const first = queue.run(async () => { starts.push(now); queue.defer(5000); throw new Error('429'); });
	const second = queue.run(async () => { starts.push(now); return 2; });
	const third = queue.run(async () => { starts.push(now); return 3; });
	await expect(queue.run(async () => 4)).rejects.toThrow('busy');
	await expect(first).rejects.toThrow('429');
	expect(await Promise.all([second, third])).toEqual([2, 3]);
	expect(starts).toEqual([0, 5000, 6000]);
});
