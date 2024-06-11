import { _ } from '@lib/i18n';
import { githubService } from '@services/github';
import { featuresService } from '@services/features';
import { DurationFormatter } from '@sapphire/time-utilities';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { IJob } from '@jobs';
import type { WeatherGoat } from '@lib/client';

interface IUpdateStatusJob extends IJob {
	[kFormatter]: DurationFormatter;
}

const kFormatter = Symbol('formatter');

export const updateStatusJob: IUpdateStatusJob = ({
	name: 'com.weathergoat.jobs.UpdateStatus',
	pattern: '*/15 * * * * *',
	runImmediately: true,

	[kFormatter]: new DurationFormatter(),

	async execute(client: WeatherGoat<true>) {
		if (featuresService.isFeatureEnabled('com.weathergoat.features.DisableStatusUpdating', false)) return;

		const duration = this[kFormatter].format(client.uptime, 3);
		const hash     = await githubService.getCurrentCommitHash(true);
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
});
