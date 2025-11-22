import { BaseJob } from '@jobs';
import { msg } from '@lib/messages';
import { GithubService } from '@services/github';
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
		private readonly github = inject(GithubService)
	) {
		super({
			name: 'update_status',
			pattern: '*/15 * * * * *',
			runImmediately: true
		});

		this.formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		const duration = this.formatter.format(client.uptime, 3);
		const hash     = await this.github.getCurrentCommitHash();

		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: msg.$jobsStatusActivity(this.pickRandomEmoji(), duration, hash.slice(0, 7)),
					type: ActivityType.Custom
				}
			]
		});
	}

	private pickRandomEmoji() {
		return this.emoji[Math.floor(Math.random() * this.emoji.length)];
	}
}
