import { Job } from '@jobs';
import { DurationFormatter } from '@sapphire/time-utilities';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import type { WeatherGoat } from '@lib/client';

export default class UpdateStatusJob extends Job {
	private readonly _formatter: DurationFormatter;

	public constructor() {
		super({ name: 'job.update-status', pattern: '*/15 * * * * *', runImmediately: true });

		this._formatter = new DurationFormatter();
	}

	public async execute(client: WeatherGoat<true>) {
		client.user.setPresence({
			status: PresenceUpdateStatus.DoNotDisturb,
			activities: [
				{
					name: `Forecasting for ${this._formatter.format(client.uptime, 3)}`,
					type: ActivityType.Custom
				}
			]
		});
	}
}
