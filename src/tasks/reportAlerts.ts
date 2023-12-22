import { client } from '@client';
import { logger } from '@logger';
import { database } from '@data';
import { snowflake } from '@snowflake';
import { getCoordinateInfo } from '@lib/location';
import { Duration } from '@sapphire/time-utilities';
import { getActiveAlertsForZone } from '@lib/alerts';
import { time, codeBlock, ChannelType, EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import type { ITask } from '#ITask';
import type { Webhook, TextChannel, ColorResolvable } from 'discord.js';

const webhookName = 'WeatherGoat#Alerts' as const;

export default ({
	interval: '1 minute',
	immediate: true,
	async execute() {
		const destinations = await database.alertDestination.findMany({
			select: {
				latitude:      true,
				longitude:     true,
				zoneId:        true,
				countyId:      true,
				guildId:       true,
				channelId:     true,
				autoCleanup:   true,
				radarImageUrl: true,
			}
		});

		if (!destinations.length) return;

		for (const { latitude, longitude, zoneId, countyId, guildId, channelId, autoCleanup, radarImageUrl } of destinations) {
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
				const activeAlerts = await getActiveAlertsForZone([zoneId], countyId ? [countyId] : []);

				if (!activeAlerts) continue;

				const relevantAlerts = activeAlerts.filter(a => a.status !== 'Test' && a.status !== 'Draft');
				const webhook        = await getChannelWebhook(channel);

				for (const alert of relevantAlerts) {
					const alertAlreadySent = await database.sentAlert.exists({ alertId: alert.id });
					if (alertAlreadySent) {
						continue;
					}

					const embed = new EmbedBuilder()
						.setTitle(`🚨 ${alert.messageType === 'Update' ? '[UPDATE] ' : ''}${alert.headline}`)
						.setDescription(codeBlock('md', alert.description))
						.setColor(getSeverityColor(alert.severity))
						.setFooter({ text: alert.event })
						.addFields([
							{ name: 'Certainty', value: alert.certainty, inline: true },
							{ name: 'Effective', value: time(alert.effective, 'R'), inline: true },
							{ name: 'Expires', value: time(alert.expires, 'R'), inline: true },
							{ name: 'Affected Areas', value: alert.areaDesc },
						])
						.setTimestamp();

					if (radarImageUrl) {
						embed.setImage(radarImageUrl + `?${snowflake.generate()}`);
					}

					const sentMessage = await webhook.send({
						username: webhookName,
						avatarURL: client.user!.avatarURL()!,
						embeds: [embed]
					});

					await database.sentAlert.create({ data: { alertId: alert.id } });

					if (autoCleanup) {
						await database.volatileMessage.create({
							data: {
								guildId,
								channelId,
								messageId: sentMessage.id,
								expires: alert.expires
							}
						});
					}

					if (alert.messageType === 'Alert') {
						const { location } = await getCoordinateInfo(latitude, longitude);
						await guild.scheduledEvents.create({
							name: `${alert.severity} Weather Alert`,
							description: alert.description,
							scheduledStartTime: new Duration('5 seconds').fromNow,
							scheduledEndTime: alert.expires,
							entityType: GuildScheduledEventEntityType.External,
							privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
							image: radarImageUrl + `?${snowflake.generate()}`,
							entityMetadata: { location },
							reason: 'Created automatically due to an active weather alert in this server. This event will be deleted when the alert expires.'
						});
					}
				}
			} catch (err) {
				logger.error('Failed to report active alerts', { zoneId, countyId, err });
			}
		}
	}
}) satisfies ITask;

function getSeverityColor(severity: string): ColorResolvable {
	switch (severity) {
		case 'Extreme':
			return '#7f1d1d';
		case 'Severe':
			return '#dc2626';
		case 'Moderate':
			return '#f97316';
		case 'Minor':
			return '#fbbf24';
		default:
		case 'Unknown':
			return '#9ca3af';
	}
}

async function getChannelWebhook(channel: TextChannel): Promise<Webhook> {
	const webhooks = await channel.fetchWebhooks();
	let ourWebhook = webhooks.find(w => w.name === webhookName);
	if (!ourWebhook) {
		ourWebhook = await channel.createWebhook({
			name: webhookName,
			reason: 'Required for weather alert reporting'
		});
	}

	return ourWebhook;
}
