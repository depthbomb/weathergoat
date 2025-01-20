import { _ } from '@i18n';
import { BaseJob } from '@jobs';
import { container } from '@container';
import { DurationFormatter } from '@sapphire/time-utilities';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@client';
import type { IGithubService } from '@services/github';

export default class UpdateStatusJob extends BaseJob {
	private readonly _github: IGithubService;
	private readonly _formatter: DurationFormatter;

	public constructor() {
		super({
			name: 'update_status',
			pattern: '*/15 * * * * *',
			runImmediately: true
		});

		this._github    = container.resolve('Github');
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
