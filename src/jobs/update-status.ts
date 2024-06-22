import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { Tokens } from '@container';
import { DurationFormatter } from '@sapphire/time-utilities';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@client';
import type { Container } from '@container';
import type { IGithubService } from '@services/github';

export default class UpdateStatusJob extends BaseJob {
	private readonly _github: IGithubService;
	private readonly _formatter: DurationFormatter;

	public constructor(container: Container) {
		super({
			name: 'com.weathergoat.jobs.UpdateStatus',
			pattern: '*/15 * * * * *',
			runImmediately: true
		});

		this._github = container.resolve(Tokens.GitHub);
		this._formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		const duration = this._formatter.format(client.uptime, 3);
		const hash = await this._github.getCurrentCommitHash(true);
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
