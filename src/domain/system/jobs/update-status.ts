import { env } from '@env';
import { db } from '@database';
import { uptime } from 'node:os';
import { $msg } from '@lib/messages';
import { BaseJob } from '@infra/jobs';
import { inject } from '@needle-di/core';
import { FeaturesService } from '@services/features';
import { formatDuration } from '@depthbomb/common/timing';
import { IncidentStatus } from '@database/generated/enums';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export class UpdateStatusJob extends BaseJob {
	private lastEmoji = '';

	private readonly emoji = {
		spring: [
			'☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌈', '💨', '🌬️', '☔', '☂️',
			'🌫️', '🌪️',
		],
		summer: [
			'☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '💨', '🌬️', '☔', '☂️', '🌫️',
			'🌪️', '🌊', '🌡️', '🏖️',
		],
		autumn: [
			'🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '💨', '🌬️', '☔', '☂️', '🌫️', '🌪️',
		],
		winter: [
			'⛅', '🌥️', '☁️', '🌨️', '❄️', '🧊', '☃️', '⛄', '💨', '🌬️', '🌫️',
		],
	} as const;

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

		if (env.get('MODE') === 'development') {
			client.user.setPresence({
				status: PresenceUpdateStatus.Idle,
				activities: [
					{
						name: $msg.system.status.devEnvActivity(),
						type: ActivityType.Custom
					}
				]
			});
			return;
		}

		const duration       = formatDuration(uptime() * 1_000, { precision: 3 });
		const incidentsCount = await db.incident.count({ where: { status: IncidentStatus.ACTIVE } });

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
		const month = new Date().getMonth();
		const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
		const emojis = this.emoji[season];

		let index = Math.floor(Math.random() * emojis.length);
		if (emojis.length > 1 && emojis[index] === this.lastEmoji) {
			index = (index + 1) % emojis.length;
		}

		const chosenEmoji = emojis[index];

		this.lastEmoji = chosenEmoji;

		return chosenEmoji;
	}
}
