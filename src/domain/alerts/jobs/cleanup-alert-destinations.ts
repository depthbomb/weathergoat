import { db } from '@database';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { toInstant } from '@database/values';
import { EventBusService } from '@services/event-bus';

export class CleanupAlertDestinationsJob extends BaseJob {
	public constructor(private readonly eventBus = inject(EventBusService)) {
		super({
			name: CleanupAlertDestinationsJob.name,
			interval: '1m',
			runImmediately: true,
		});
	}

	public async execute() {
		const { count } = await db.orm.public.AlertDestination
			.where((f) => f.expiresAt.lte(toInstant(new Date())))
				.deleteAndCount()
				.then((count) => ({ count }));
		if (count > 0) {
			this.eventBus.emit('alert-destinations:updated');
			this.logger.withMetadata({ count }).info('Cleaned up expired alert destinations');
		}
	}
}
