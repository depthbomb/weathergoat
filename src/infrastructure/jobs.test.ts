import { BaseJob } from './jobs';
import { test, expect } from 'bun:test';
import type { WeatherGoat } from '@lib/client';

const client = null as unknown as WeatherGoat;

test('a job does not overlap with an active execution', async () => {
	let release!: () => void;
	const gate = new Promise<void>(resolve => {
		release = resolve;
	});

	class ControlledJob extends BaseJob {
		public executions = 0;

		public constructor() {
			super({ name: ControlledJob.name, interval: '1s' });
		}

		public async execute() {
			this.executions++;
			await gate;
		}
	}

	const job = new ControlledJob();
	const firstExecution = job.callExecute(client);

	expect(job.isRunning).toBeTrue();
	expect(await job.callExecute(client)).toBeFalse();
	expect(job.executions).toBe(1);

	release();

	expect(await firstExecution).toBeTrue();
	expect(job.isRunning).toBeFalse();
	expect(job.lastRun).toBeInstanceOf(Date);
});

test('a failed job releases its execution lock and reports completion metadata', async () => {
	class FailingJob extends BaseJob {
		public constructor() {
			super({ name: FailingJob.name, interval: '1s' });
		}

		public async execute() {
			throw new Error('expected failure');
		}
	}

	const job = new FailingJob();

	await expect(job.callExecute(client)).rejects.toThrow('expected failure');
	expect(job.isRunning).toBeFalse();
	expect(job.lastRun).toBeInstanceOf(Date);

	await expect(job.callExecute(client)).rejects.toThrow('expected failure');
});
