import { client } from '@client';
import { ActivityType } from 'discord.js';
import { DurationFormatter } from '@sapphire/time-utilities';
import type { ITask } from '#ITask';

const formatter = new DurationFormatter();

export default ({
	interval: '15 seconds',
	immediate: true,
	async execute() {
		client.user?.setPresence({
			activities: [{
				name: `Forecasting for ${formatter.format(client?.uptime ?? 0, 3)} (version ${__VERSION__}/${__BUILD_HASH__})`,
				type: ActivityType.Custom
			}],
			status: 'dnd'
		});
	}
}) as ITask;

