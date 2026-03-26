import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { generateSnowflake } from '@lib/snowflake';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { isDiscordAPIError, isDiscordAPIErrorCode } from '@errors';
import { time, ButtonStyle, EmbedBuilder, ButtonBuilder, ActionRowBuilder, RESTJSONErrorCodes } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class UpdateRadarMessagesJob extends BaseJob {
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
		for (const { id, guildId, channelId, messageId, location, radarStation, radarImageUrl } of dueMessages) {
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

				const embed = new EmbedBuilder()
					.setColor(Color.Primary)
					.setTitle($msg.jobs.radar.embedTitle(location))
					.setFooter({ text: $msg.jobs.radar.embedFooter(radarStation) })
					.setImage(`${radarImageUrl}?${generateSnowflake()}`)
					.addFields(
						{ name: $msg.jobs.radar.lastUpdatedTitle(), value: time(new Date(), 'R'), inline: true },
						{ name: $msg.jobs.radar.nextUpdateTitle(), value: time(nextUpdate, 'R'), inline: true },
					);

				const deleteButton = new ButtonBuilder()
					.setCustomId(`delete-auto-radar:${messageId}`)
					.setLabel($msg.common.buttons.delete())
					.setStyle(ButtonStyle.Danger);
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton);

				await message.edit({ content: '', embeds: [embed], components: [row] });
				await db.autoRadarMessage.update({
					data: {
						nextUpdate
					},
					where: {
						id
					}
				});
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
