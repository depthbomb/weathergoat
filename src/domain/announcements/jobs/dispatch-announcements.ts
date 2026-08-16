import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { MessageFlags, ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS   = 5 * 60 * 1_000;
const RETRY_MAX_DELAY_MS    = 6 * 60 * 60 * 1_000;

export class DispatchAnnouncementsJob extends BaseJob {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: DispatchAnnouncementsJob.name,
			interval: '1m'
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableAnnouncementDispatching')) {
			return;
		}

		const now = new Date();
		const batch = await db.announcementDelivery.findMany({
			where: {
				sentAt: null,
				attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
				nextAttemptAt: { lte: now }
			},
			orderBy: [
				{ nextAttemptAt: 'asc' },
				{ id: 'asc' }
			],
			take: 10,
			include: { subscription: true, announcement: true }
		});
		for (const delivery of batch) {
			const announcement = delivery.announcement;
			const container = new ContainerBuilder()
				.setAccentColor(Color.Primary)
				.addSectionComponents(s => s
					.addTextDisplayComponents(d => d.setContent(`# ${announcement.title}`))
					.setThumbnailAccessory(tn => tn.setURL(client.user.avatarURL()!))
				)
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
				.addTextDisplayComponents(d => d.setContent(announcement.body))
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
				.addTextDisplayComponents(d => d.setContent($msg.announcements.dispatch.dmReason()));

			try {
				const user = await client.users.fetch(delivery.subscription.userId);
				const dm   = await user.createDM(true);

				await dm.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
				await db.announcementDelivery.update({
					where: { id: delivery.id },
					data: {
						sentAt: new Date(),
						failedAt: null,
						error: null
					}
				});
			} catch (err) {
				const failedAt       = new Date();
				const attemptCount    = delivery.attemptCount + 1;
				const nextAttemptAt   = this.getNextAttemptAt(failedAt, attemptCount);
				const terminalFailure = attemptCount >= MAX_DELIVERY_ATTEMPTS;

				await db.announcementDelivery.update({
					where: { id: delivery.id },
					data: {
						failedAt,
						error: err instanceof Error ? err.message : String(err),
						attemptCount,
						nextAttemptAt
					}
				});

				const metadata = { deliveryId: delivery.id, attemptCount, nextAttemptAt };
				if (terminalFailure) {
					reportError('Announcement delivery exhausted its retry limit', err, { announcement, delivery, ...metadata });
				} else {
					this.logger
						.withError(err)
						.withMetadata(metadata)
						.warn('Announcement delivery scheduled for retry');
				}
			}
		}
	}

	private getNextAttemptAt(failedAt: Date, attemptCount: number) {
		const delay = Math.min(RETRY_BASE_DELAY_MS * (2 ** Math.max(attemptCount - 1, 0)), RETRY_MAX_DELAY_MS);
		return new Date(failedAt.getTime() + delay);
	}
}
