import { BaseJob } from '@jobs';
import { msg } from '@lib/messages';
import { container } from '@container';
import { GithubService } from '@services/github';
import { DurationFormatter } from '@sapphire/duration';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export default class UpdateStatusJob extends BaseJob {
	private readonly github: GithubService;
	private readonly formatter: DurationFormatter;

	public constructor() {
		super({
			name: 'update_status',
			pattern: '*/15 * * * * *',
			runImmediately: true
		});

		this.github    = container.resolve(GithubService);
		this.formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		const duration = this.formatter.format(client.uptime, 3);
		const hash     = await this.github.getCurrentCommitHash(true);

		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: msg.$jobsStatusActivity(duration, hash),
					type: ActivityType.Custom
				}
			]
		});
	}
}
