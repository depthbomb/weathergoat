import { db } from '@db';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { MessageFlags, ContainerBuilder, SeparatorSpacingSize } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class DispatchAnnouncementsJob extends BaseJob {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: 'dispatch_announcements',
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
				.addTextDisplayComponents(d => d.setContent('-# This server is receiving this because it opted into announcements.'));

			try {
				const channel = await client.channels.fetch(delivery.subscription.channelId);
				if (!channel || !isTextChannel(channel)) {
					continue;
				}

				await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
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
