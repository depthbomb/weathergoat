import { db } from '@db';
import { _ } from '@lib/i18n';
import { withQuery } from 'ufo';
import { alertsService } from '@services/alerts';
import { featuresService } from '@services/features';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import { time, codeBlock, EmbedBuilder, messageLink } from 'discord.js';
import type { IJob } from '@jobs';
import type { WeatherGoat } from '@lib/client';

interface IReportAlertsJob extends IJob {
	[kWebhookName]: string;
	[kWebhookReason]: string;
}

const kWebhookName   = Symbol('webhook-name');
const kWebhookReason = Symbol('webhook-reason');

export const reportAlertsJob: IReportAlertsJob = ({
	name: 'com.weathergoat.jobs.ReportAlerts',
	pattern: '*/10 * * * * *',

	[kWebhookName]: 'WeatherGoat#Alerts',
	[kWebhookReason]: 'Required for weather alert reporting',

	async execute(client: WeatherGoat<true>) {
		if (featuresService.isFeatureEnabled('com.weathergoat.features.DisableAlertReporting', false)) return;

		const destinations = await db.alertDestination.findMany({
			select: {
				zoneId: true,
				countyId: true,
				guildId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
				pingOnSevere: true,
			}
		});
		for (const { zoneId, countyId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);

			if (!isTextChannel(channel)) continue;

			const alerts  = await alertsService.getActiveAlertsForZone(zoneId, countyId);
			for (const alert of alerts) {
				const alreadyReported = await db.sentAlert.findFirst({
					where: {
						alertId: alert.id,
						guildId: channel.guildId,
						channelId
					}
				});
				if (alreadyReported || alert.status === 'Exercise' || alert.status === 'Test') {
					continue;
				}

				const isUpdate = alert.messageType === 'Update';
				const embed = new EmbedBuilder()
					.setTitle(`${isUpdate ? '🔁 ' + _('jobs.alerts.updateTag') : '🚨'} ${alert.headline}`)
					.setDescription(codeBlock('md', alert.description))
					.setColor(alert.severityColor)
					.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
					.setURL(withQuery('https://alerts.weather.gov/search', { id: alert.id }))
					.setFooter({ text: alert.event })
					.addFields(
						{ name: _('jobs.alerts.certaintyTitle'), value: alert.certainty, inline: true },
						{ name: _('jobs.alerts.effectiveTitle'), value: time(alert.effective, 'R'), inline: true },
						{ name: _('jobs.alerts.expiresTitle'), value: time(alert.expires, 'R'), inline: true },
						{ name: _('jobs.alerts.affectedAreasTitle'), value: alert.areaDesc }
					)
					.setTimestamp();

				if (alert.instruction) {
					embed.addFields({ name: _('jobs.alerts.instructionsTitle'), value: codeBlock('md', alert.instruction) });
				}

				if (radarImageUrl) {
					embed.setImage(radarImageUrl + `?${client.generateId(16)}`);
				}

				if (alert.references.length) {
					const messageLinks = [] as string[];
					for (const { identifier } of alert.references) {
						const referencedSentAlert = await db.sentAlert.findFirst({ where: { alertId: identifier } });
						if (!referencedSentAlert) {
							continue;
						}

						messageLinks.push(
							messageLink(channelId, referencedSentAlert.messageId, guildId)
						);
					}

					if (messageLinks.length) {
						embed.addFields({ name: _('jobs.alerts.referencesTitle'), value: messageLinks.join('\n') });
					}
				}

				const shouldPingEveryone = !!((alert.severity === 'Severe' || alert.severity === 'Extreme') && pingOnSevere);
				const webhook            = await client.getOrCreateWebhook(channel, this[kWebhookName], this[kWebhookReason]);
				const { id: messageId }  = await webhook.send({
					content: shouldPingEveryone ? '@everyone' : '',
					username: this[kWebhookName],
					avatarURL: client.user.avatarURL({ forceStatic: false })!,
					embeds: [embed]
				});

				if (autoCleanup) {
					const expiresAt = alert.expires;
					await db.volatileMessage.create({
						data: {
							guildId,
							channelId,
							messageId,
							expiresAt
						}
					});
				}

				await db.sentAlert.create({
					data: {
						alertId: alert.id,
						guildId,
						channelId: channelId,
						messageId,
						json: JSON.stringify(alert)
					}
				});
			}
		}
	}
});
