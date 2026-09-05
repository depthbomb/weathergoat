import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { and } from '@prisma/orm-postgres/orm-client';
import { toInstant, requireRecord } from '@database/values';
import { MessageFlags, ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5 * 60 * 1_000;
const RETRY_MAX_DELAY_MS = 6 * 60 * 60 * 1_000;

export class DispatchAnnouncementsJob extends BaseJob {
	public constructor(private readonly features = inject(FeaturesService)) {
		super({
			name: DispatchAnnouncementsJob.name,
			interval: '1m',
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableAnnouncementDispatching')) {
			return;
		}

		const now = new Date();
		const batch = await db.orm.public.AnnouncementDelivery.where((f) =>
			and(f.sentAt.isNull(), f.attemptCount.lt(MAX_DELIVERY_ATTEMPTS), f.nextAttemptAt.lte(toInstant(now))))
				.orderBy([(f) => f.nextAttemptAt.asc(), (f) => f.id.asc()])
				.limit(10)
				.all();
		if (!batch.length) {
			return;
		}

		const [announcements, subscriptions] = await Promise.all([
			db.orm.public.Announcement.where((f) =>
				f.id.in([...new Set(batch.map((d) => d.announcementId))]),
			).all(),
			db.orm.public.AnnouncementSubscription.where((f) =>
				f.id.in([...new Set(batch.map((d) => d.subscriptionId))]),
			).all(),
		]);
		const announcementsById = new Map(announcements.map((a) => [a.id, a]));
		const subscriptionsById = new Map(subscriptions.map((s) => [s.id, s]));
		for (const delivery of batch) {
			const announcement = announcementsById.get(delivery.announcementId);
			const subscription = subscriptionsById.get(delivery.subscriptionId);
			if (!announcement || !subscription) {
				continue;
			}

			const container = new ContainerBuilder()
				.setAccentColor(Color.Primary)
				.addSectionComponents((s) => s
					.addTextDisplayComponents((d) => d.setContent(`# ${announcement.title}`))
					.setThumbnailAccessory((tn) => tn.setURL(client.user.avatarURL()!)),
				)
				.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
				.addTextDisplayComponents((d) => d.setContent(announcement.body))
				.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
				.addTextDisplayComponents((d) => d.setContent($msg.announcements.dispatch.dmReason()));

			try {
				const user = await client.users.fetch(subscription.userId);
				const dm = await user.createDM(true);

				await dm.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
				await db.orm.public.AnnouncementDelivery.where((f) => f.id.eq(delivery.id))
					.update({ sentAt: toInstant(new Date()), failedAt: toInstant(null), error: null })
					.then(requireRecord);
			} catch (err) {
				const failedAt = new Date();
				const attemptCount = delivery.attemptCount + 1;
				const nextAttemptAt = this.getNextAttemptAt(failedAt, attemptCount);
				const terminalFailure = attemptCount >= MAX_DELIVERY_ATTEMPTS;

				await db.orm.public.AnnouncementDelivery.where((f) => f.id.eq(delivery.id))
					.update({
						failedAt: toInstant(failedAt),
						error: err instanceof Error ? err.message : String(err),
						attemptCount: attemptCount,
						nextAttemptAt: toInstant(nextAttemptAt),
					})
					.then(requireRecord);

				const metadata = { deliveryId: delivery.id, attemptCount, nextAttemptAt };
				if (terminalFailure) {
					reportError('Announcement delivery exhausted its retry limit', err, {
						announcement,
						delivery,
						...metadata,
					});
				} else {
					this.logger.withError(err).withMetadata(metadata).warn('Announcement delivery scheduled for retry');
				}
			}
		}
	}

	private getNextAttemptAt(failedAt: Date, attemptCount: number) {
		const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(attemptCount - 1, 0), RETRY_MAX_DELAY_MS);
		return new Date(failedAt.getTime() + delay);
	}
}
