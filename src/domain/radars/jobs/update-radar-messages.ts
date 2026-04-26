import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import {
	time,
	ButtonStyle,
	ButtonBuilder,
	ActionRowBuilder,
	ContainerBuilder,
	RESTJSONErrorCodes,
	SeparatorSpacingSize
} from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class UpdateRadarMessagesJob extends BaseJob {
	private readonly errorCodes = [
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.UnknownGuild,
		RESTJSONErrorCodes.UnknownMessage
	];

	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: UpdateRadarMessagesJob.name,
			pattern: '* * * * *',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableRadarMessageUpdating')) {
			return;
		}

		const dueMessages = await db.autoRadarMessage.findMany({
			where: {
				nextUpdate: { lte: new Date() }
			},
			take: 500
		});
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl, velocityRadarImageUrl, showReflectivity, showVelocity } of dueMessages) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger
						.withMetadata({ guildId, channelId, messageId, location })
						.warn('Radar channel is not a text channel, deleting record');

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Auto radar message is not editable, deleting record');

					await db.autoRadarMessage.delete({ where: { id } });
					continue;
				}

				const nextUpdate = new Date(Temporal.Now.instant().add({ minutes: 5 }).epochMilliseconds);

				const container = new ContainerBuilder()
					.setAccentColor(Color.Primary)
					.addTextDisplayComponents(t => t
						.setContent($msg.radar.job.embedTitle(location))
					)
					.addMediaGalleryComponents(g => {
						if (showReflectivity) {
							g.addItems(i => i.setURL(`${radarImageUrl}?s=${generateSnowflake()}`));
						}

						if (showVelocity) {
							g.addItems(i => i.setURL(`${velocityRadarImageUrl}?s=${generateSnowflake()}`));
						}

						return g;
					})
					.addTextDisplayComponents(t => t
						.setContent($msg.radar.job.updateWindow(time(new Date(), 'R'), time(nextUpdate, 'R')))
					)
					.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
					.addTextDisplayComponents(t => t
						.setContent($msg.radar.job.embedFooter(radarStation))
					);

				const deleteButton = new ButtonBuilder()
					.setCustomId(`delete-auto-radar:${messageId}`)
					.setLabel($msg.shared.buttons.delete())
					.setStyle(ButtonStyle.Danger);
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton);

				await message.edit({ content: '', components: [container, row] });
				await db.autoRadarMessage.update({ data: { nextUpdate }, where: { id } });
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger
							.withMetadata({ guildId, channelId, messageId, location, code, message })
							.error('Could not fetch required resource(s), deleting corresponding record');

						await db.autoRadarMessage.delete({ where: { id } });
					}
				} else {
					throw err;
				}
			}
		}
	}
}
