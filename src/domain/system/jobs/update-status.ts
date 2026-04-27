import { db } from '@database';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { FeaturesService } from '@services/features';
import { formatDuration } from '@depthbomb/common/timing';
import { IncidentStatus } from '@database/generated/enums';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class UpdateStatusJob extends BaseJob {
	private readonly emoji = [
		'🌪️',
		'☀️',
		'🌤️',
		'⛅',
		'🌥️',
		'☁️',
		'🌦️',
		'🌧️',
		'⛈️',
		'🌩️',
		'🌨️',
		'❄️',
		'💨',
		'☔',
		'☂️',
		'🌫️',
		'🌊'
	] as const;

	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			name: UpdateStatusJob.name,
			interval: '15s',
			runImmediately: true
		});
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableStatusUpdating')) {
			return;
		}

		const duration       = formatDuration(client.uptime, { precision: 3 });
		const incidentsCount = await db.incident.count({
			where: { status: IncidentStatus.ACTIVE }
		});

		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: $msg.system.status.activity(incidentsCount, this.pickRandomEmoji(), duration),
					type: ActivityType.Custom
				}
			]
		});
	}

	private pickRandomEmoji() {
		return this.emoji[Math.floor(Math.random() * this.emoji.length)];
	}
}
