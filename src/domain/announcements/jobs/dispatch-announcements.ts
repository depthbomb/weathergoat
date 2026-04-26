import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { MessageFlags, ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class DispatchAnnouncementsJob extends BaseJob {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: DispatchAnnouncementsJob.name,
			pattern: '* * * * *'
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableAnnouncementDispatching')) {
			return;
		}

		const batch = await db.announcementDelivery.findMany({
			where: { sentAt: null },
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
					data: { sentAt: new Date() }
				});
			} catch (err) {
				reportError('Failed to dispatch announcement', err, { announcement, delivery });
				await db.announcementDelivery.update({
					where: { id: delivery.id },
					data: { failedAt: new Date(), error: (err as Error).message }
				});
			}
		}
	}
}
