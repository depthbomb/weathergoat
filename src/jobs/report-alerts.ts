import { db } from '@db';
import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { Color } from '@constants';
import { container } from '@container';
import { HTTPRequestError } from '@errors';
import { logger, reportError } from '@logger';
import { generateSnowflake } from '@snowflake';
import { time, codeBlock, EmbedBuilder } from 'discord.js';
import { EmbedLimits, isTextChannel } from '@sapphire/discord.js-utilities';
import type { Logger } from 'winston';
import type { Alert } from '@models/Alert';
import type { WeatherGoat } from '@client';
import type { TextChannel } from 'discord.js';
import type { IAlertsService } from '@services/alerts';
import type { ISweeperService } from '@services/sweeper';

export default class ReportAlertsJob extends BaseJob {
	private readonly logger: Logger;
	private readonly alerts: IAlertsService;
	private readonly sweeper: ISweeperService;
	private readonly webhookUsername = 'WeatherGoat#Alerts';

	public constructor() {
		super({
			name: 'report_alerts',
			pattern: '*/30 * * * * *',
			runImmediately: true
		});

		this.logger  = logger.child({ jobName: this.name });
		this.alerts  = container.resolve('Alerts');
		this.sweeper = container.resolve('Sweeper');
	}

	public async execute(client: WeatherGoat<true>) {
		const destinations = await db.alertDestination.findMany({
			select: {
				countyId: true,
				guildId: true,
				channelId: true,
				autoCleanup: true,
				radarImageUrl: true,
				pingOnSevere: true,
			}
		});
		for (const { countyId, guildId, channelId, autoCleanup, radarImageUrl, pingOnSevere } of destinations) {
			const channel = await client.channels.fetch(channelId);
			if (!isTextChannel(channel)) {
				continue;
			}

			try {
				const alerts = await this.alerts.getActiveAlertsForZone(countyId);
				for (const alert of alerts.filter(a => a.isNotTest)) {
					const alreadyReported = await db.sentAlert.findFirst({
						where: {
							alertId: alert.id,
							guildId: channel.guildId,
							channelId
						}
					});
					if (alreadyReported) {
						continue;
					}

					const description = codeBlock('md', alert.description);
					const embed = new EmbedBuilder()
						.setTitle(`${alert.isUpdate ? '🔁 ' + _('jobs.alerts.updateTag') : '🚨'} ${alert.headline}`)
						.setColor(this.getAlertSeverityColor(alert))
						.setAuthor({ name: alert.senderName, iconURL: 'https://www.weather.gov/images/nws/nws_logo.png' })
						.setURL(alert.url)
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
						embed.setImage(radarImageUrl + `?${generateSnowflake()}`);
					}

					if (
						(embed.length + description.length) > EmbedLimits.MaximumTotalCharacters ||
						description.length > EmbedLimits.MaximumDescriptionLength
					) {
						embed.setDescription(_('jobs.alerts.payloadTooLargePlaceholder', { alert }));
					} else {
						embed.setDescription(description);
					}

					const shouldPingEveryone = !!(
						(alert.severity === 'Severe' || alert.severity === 'Extreme') &&
						(!alert.event.includes('Excessive Heat Warning') && !alert.event.includes('Heat Advisory')) &&
						pingOnSevere
					);
					const webhook     = await this.getOrCreateWebhook(channel);
					const sentMessage = await webhook.send({
						content: shouldPingEveryone ? '@everyone' : '',
						username: this.webhookUsername,
						avatarURL: client.user.avatarURL({ forceStatic: false })!,
						embeds: [embed]
					});

					if (autoCleanup) {
						const expiresAt = alert.expires;
						await this.sweeper.enqueueMessage(sentMessage, expiresAt);
					}

					await db.sentAlert.create({
						data: {
							alertId: alert.id,
							guildId,
							channelId: channelId,
							messageId: sentMessage.id,
							json: alert.json
						}
					});

					// Enqueue expired alert messages to be deleted immediately
					if (alert.expiredReferences) {
						for (const expiredReference of alert.expiredReferences) {
							const expiredSentAlert = await db.sentAlert.findFirst({
								where: {
									alertId: expiredReference.alertId
								}
							});

							if (!expiredSentAlert) continue;

							await this.sweeper.enqueueMessage(
								expiredSentAlert.guildId,
								expiredSentAlert.channelId,
								expiredSentAlert.messageId,
								new Date()
							);
						}
					}
				}
			} catch (err) {
				if (err instanceof HTTPRequestError && err.code === 503) {
					continue;
				}

				reportError('An error occurred while reporting alerts', err, { countyId, guildId, channelId });
			}
		}
	}

	private async getOrCreateWebhook(channel: TextChannel) {
		const reason = 'Required for weather alert reporting';
		const webhooks = await channel.fetchWebhooks();
		let ourWebhook = webhooks.find(w => w.name === this.webhookUsername && w.client === channel.client);
		if (!ourWebhook) {
			ourWebhook = await channel.createWebhook({ name: this.webhookUsername, reason });

			this.logger.info('Created webhook', { name: this.webhookUsername, channel: channel.name });
		}

		return ourWebhook;
	}

	private getAlertSeverityColor(alert: Alert) {
		switch (alert.severity) {
			case 'Unknown':
				return Color.SeverityUnknown;
			case 'Minor':
				return Color.SeverityMinor;
			case 'Moderate':
				return Color.SeverityModerate;
			case 'Severe':
				return Color.SeveritySevere;
			case 'Extreme':
				return Color.SeverityExtreme;
		}
	}

	private getAlertBanner(alert: Alert) {
		switch (alert.severity) {
			case 'Unknown':
				return 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484748267622.png?size=4096';
			case 'Minor':
				return 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424486711197697.png?size=4096';
			case 'Moderate':
				return 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484551135314.png?size=4096';
			case 'Severe':
				return 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484307734620.png?size=4096';
			case 'Extreme':
				return 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484203003965.png?size=4096';
		}
	}
}
