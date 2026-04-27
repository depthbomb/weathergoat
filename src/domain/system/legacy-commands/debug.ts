import { db } from '@database';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { AttachmentBuilder } from 'discord.js';
import { FeaturesService } from '@services/features';
import { BaseLegacyCommand, LegacyCommandError, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Print  = 'print',
	DumpDb = 'dump-db'
}

export class DebugCommand extends BaseLegacyCommand {
	public constructor(
		private readonly features = inject(FeaturesService),
	) {
		super({
			name: 'debug',
			description: 'Debug commands.',
			subcommands: {
				[Subcommands.Print]: [
					LegacyCommandParam.string('domain'),
				],
				[Subcommands.DumpDb]: [],
			},
		});
	}

	public async [Subcommands.Print](message: Message) {
		let json = '{}';

		const domain = this.ctx.params.getString('domain', true);
		switch (domain) {
			case 'jobs':
				const jobs = Array.from(message.client.jobs.values());
				json = JSON.stringify(jobs.map(job => ({
					name: job.name,
					interval: job.interval,
					runImmediately: job.runImmediately,
					nextRun: job.nextRun,
					lastRun: job.lastRun,
					nextRunMs: job.nextRunMs,
				})), null, 4);
				break;
			case 'features':
				json = JSON.stringify(this.features.all(), null, 4);
				break;
			default:
				throw new LegacyCommandError(`Unknown domain \`${domain}\`. Expected \`jobs\` or \`features\`.`);
		}

		await message.reply(json.toCodeBlock('json'));
	}

	public async [Subcommands.DumpDb](message: Message) {
		const date = new Date();
		const [
			alertDestinations,
			forecastDestinations,
			autoRadarMessages,
			sentAlerts,
			volatileMessages
		] = await Promise.all([
			db.alertDestination.findMany(),
			db.forecastDestination.findMany(),
			db.autoRadarMessage.findMany(),
			db.sentAlert.findMany(),
			db.volatileMessage.findMany()
		]);

		const json = JSON.stringify({
			date,
			alertDestinations,
			forecastDestinations,
			autoRadarMessages,
			sentAlerts,
			volatileMessages
		}, null, 4);
		const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), {
			name: 'dump.json',
			description: $msg.system.debug.dumpDescription(date)
		});

		await message.reply({ files: [attachment] });
	}
}
