import { client } from '@client';
import { logger } from '@logger';
import { database } from '@data';
import { snowflake } from '@snowflake';
import { getCoordinateInfo } from '@lib/location';
import { Duration } from '@sapphire/time-utilities';
import { getForecastForCoordinates } from '@lib/forecast';
import { ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ITask } from '#ITask';

export default ({
	cron: '0 * * * *',
	async execute() {
		const destinations = await database.forecastDestination.findMany({
			select: {
				latitude:      true,
				longitude:     true,
				guildId:       true,
				channelId:     true,
				autoCleanup:   true,
				radarImageUrl: true
			}
		});

		if (!destinations.length) {
			return;
		}

		for (const { latitude, longitude, guildId, channelId, autoCleanup, radarImageUrl } of destinations) {
			const guild = await client.guilds.fetch(guildId);
			if (!guild) {
				logger.error('Guild not found', guildId);
				continue;
			}

			const channel = await guild.channels.fetch(channelId);
			if (!channel) {
				logger.error('Channel not found', channelId);
				continue;
			}

			if (channel.type !== ChannelType.GuildText) {
				logger.error('Channel not text-based', channelId);
				continue;
			}

			try {
				const forecast = await getForecastForCoordinates(latitude, longitude);
				const location = await getCoordinateInfo(latitude, longitude);
				const embed    = new EmbedBuilder()
					.setTitle(`⛅ ${forecast.name}'s Forecast for ${location.location}`)
					.setColor('#06b6d4')
					.setThumbnail(forecast.icon.replace('medium', 'large'))
					.setDescription(forecast.detailedForecast)
					.addFields([{ name: 'At a glance', value: forecast.shortForecast }])
					.setTimestamp();

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${snowflake.generate()}`);
				}

				const sentMessage = await channel.send({
					embeds: [embed],
					flags: MessageFlags.SuppressNotifications
				});

				if (autoCleanup) {
					await database.volatileMessage.create({
						data: {
							guildId,
							channelId,
							messageId: sentMessage.id,
							expires:   new Duration('4 hours').fromNow
						}
					});
				}
			} catch (err) {
				logger.error('Failed to report forecast', { latitude, longitude, err });
			}
		}
	}
}) satisfies ITask;
