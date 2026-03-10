import { BaseJob } from '@jobs';
import { msg } from '@lib/messages';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { DurationFormatter } from '@sapphire/duration';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

@injectable()
export default class UpdateStatusJob extends BaseJob {
	private readonly formatter: DurationFormatter;
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
			name: 'update_status',
			pattern: '*/15 * * * * *',
			runImmediately: true
		});

		this.formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		if (this.features.isFeatureEnabled('disableStatusUpdating')) {
			return;
		}

		const duration = this.formatter.format(client.uptime, 3);

		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: msg.$jobsStatusActivity(this.pickRandomEmoji(), duration),
					type: ActivityType.Custom
				}
			]
		});
	}

	private pickRandomEmoji() {
		return this.emoji[Math.floor(Math.random() * this.emoji.length)];
	}
}
