import { Job } from '@jobs';
import { _ } from '@lib/i18n';
import { Tokens } from '@tokens';
import { container } from 'tsyringe';
import { DurationFormatter } from '@sapphire/time-utilities';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';
import type { GithubService } from '@services/github';

export default class UpdateStatusJob extends Job {
	private readonly _github: GithubService;
	private readonly _formatter: DurationFormatter;

	public constructor() {
		super({ name: 'job.update-status', pattern: '*/15 * * * * *', runImmediately: true });

		this._github    = container.resolve(Tokens.Github);
		this._formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		const duration = this._formatter.format(client.uptime, 3);
		const hash     = await this._github.getCurrentCommitHash(true);
		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: _('jobs.status.activity', { duration, hash }),
					type: ActivityType.Custom
				}
			]
		});
	}
}
