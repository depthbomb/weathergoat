import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { parseDuration } from '@depthbomb/common/timing';
import { toInstant, requireRecord } from '@database/values';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import {
	time,
	ButtonStyle,
	ButtonBuilder,
	ContainerBuilder,
	RESTJSONErrorCodes,
	SeparatorSpacingSize
} from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class UpdateRadarMessagesJob extends BaseJob {
	private readonly errorCodes = [
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.UnknownGuild,
		RESTJSONErrorCodes.UnknownMessage,
	];

	public constructor(
		private readonly features = inject(FeaturesService),
		private readonly database = db,
	) {
		super({
			name: UpdateRadarMessagesJob.name,
			interval: '1m',
			runImmediately: true,
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableRadarMessageUpdating')) {
			return;
		}

		const dueMessages = await this.database.orm.public.AutoRadarMessage.where((f) =>
			f.nextUpdate.lte(toInstant(new Date())),
		)
			.orderBy([(f) => f.nextUpdate.asc(), (f) => f.id.asc()])
			.limit(100)
			.all();
		for (const {
			id,
			guildId,
			channelId,
			messageId,
			location,
			radarStation,
			radarImageUrl,
			velocityRadarImageUrl,
			showReflectivity,
			showVelocity,
			updateInterval,
		} of dueMessages) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (!isTextChannel(channel)) {
					this.logger
						.withMetadata({ guildId, channelId, messageId, location })
						.warn('Radar channel is not a text channel, deleting record');

					await this.database.orm.public.AutoRadarMessage.where((f) => f.id.eq(id))
						.delete()
						.then(requireRecord);
					continue;
				}

				const message = await channel.messages.fetch(messageId);
				if (!message.editable) {
					this.logger
						.withMetadata({ guildId, channelId, messageId })
						.warn('Auto radar message is not editable, deleting record');

					await this.database.orm.public.AutoRadarMessage.where((f) => f.id.eq(id))
						.delete()
						.then(requireRecord);
					continue;
				}

				const nextUpdate = parseDuration(updateInterval).fromNow();
				const container = new ContainerBuilder()
					.setAccentColor(Color.Primary)
					.addTextDisplayComponents((t) => t.setContent($msg.radar.job.embedTitle(location)));

				if (showReflectivity && showVelocity) {
					container.addTextDisplayComponents((t) => t.setContent($msg.radar.job.bothRadarsDescription()));
				}

				container
					.addMediaGalleryComponents((g) => {
						if (showReflectivity) {
							g.addItems((i) => i.setURL(`${radarImageUrl}?s=${generateSnowflake()}`));
						}

						if (showVelocity) {
							g.addItems((i) => i.setURL(`${velocityRadarImageUrl}?s=${generateSnowflake()}`));
						}

						return g;
					})
					.addTextDisplayComponents((t) =>
						t.setContent($msg.radar.job.updateWindow(time(new Date(), 'R'), time(nextUpdate, 'T'))),
					)
					.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
					.addTextDisplayComponents((t) => t.setContent($msg.radar.job.embedFooter(radarStation)));

				const deleteButton = new ButtonBuilder()
					.setCustomId(`delete-auto-radar:${messageId}`)
					.setLabel($msg.shared.buttons.delete())
					.setStyle(ButtonStyle.Danger);
				container.addActionRowComponents((a) => a.addComponents(deleteButton));

				await message.edit({ content: String.empty(), components: [container] });
				await this.database.orm.public.AutoRadarMessage.where((f) => f.id.eq(id))
					.update({ nextUpdate: toInstant(nextUpdate) })
					.then(requireRecord);
			} catch (err) {
				if (isDiscordAPIError(err)) {
					const { code, message } = err;
					if (isDiscordAPIErrorCode(err, this.errorCodes)) {
						this.logger
							.withMetadata({ guildId, channelId, messageId, location, code, message })
							.error('Could not fetch required resource(s), deleting corresponding record');

						await this.database.orm.public.AutoRadarMessage.where((f) => f.id.eq(id))
							.delete()
							.then(requireRecord);
						continue;
					}
				}

				// Keep subscriptions recoverable when permissions or the network recover,
				// but move failed work behind other due messages.
				const nextUpdate = new Date(Date.now() + 5 * 60_000);
				this.logger
					.withError(err)
					.withMetadata({ id, guildId, channelId, messageId, nextUpdate })
					.warn('Radar update failed; retrying in five minutes');
				await this.database.orm.public.AutoRadarMessage.where((f) => f.id.eq(id))
					.update({ nextUpdate: toInstant(nextUpdate) })
					.then(requireRecord);
			}
		}
	}
}
