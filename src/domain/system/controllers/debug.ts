import { db } from '@database';
import { $msg } from '@lib/messages';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { OwnerPrecondition } from '@preconditions/owner';
import { subcommand, BaseInteractionController } from '@infra/controllers';
import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class DebugController extends BaseInteractionController {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			data: new SlashCommandBuilder()
			.setName('debug')
			.setDescription('Owner-only debug commands')
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.addSubcommand(sc => sc
				.setName('print')
				.setDescription('Prints string representations of various domains of my application')
				.addStringOption(o => o
					.setName('domain')
					.setDescription('The domain in which to print')
					.addChoices(
						{ name: 'Jobs', value: 'jobs' },
						{ name: 'Features', value: 'features' },
					)
					.setRequired(true)
				)
			)
			.addSubcommand(sc => sc
				.setName('dump-db')
				.setDescription('Dumps all of the data in my database to a JSON file')
			)
		});
	}

	@subcommand('print')
	public async handlePrintSubcommand(interaction: ChatInputCommandInteraction) {
		const domain = interaction.options.getString('domain', true) as 'jobs' | 'features';
		let json: string = '';
		switch (domain) {
			case 'jobs':
				const jobs = Array.from(interaction.client.jobs.values());
				json = JSON.stringify(jobs.map(({ job, cron }) => ({
					name: job.name,
					pattern: job.pattern,
					runImmediately: job.runImmediately,
					previousRun: cron.previousRun(),
					nextRun: cron.nextRun(),
					msToNextRun: cron.msToNext(),
				})), null, 4);
				break;
			case 'features':
				json = JSON.stringify(this.features.all(), null, 4);
				break;
		}

		await interaction.reply(json.toCodeBlock('json'));
	}

	@subcommand('dump-db', new OwnerPrecondition())
	public async handleDumpDbSubcommand(interaction: ChatInputCommandInteraction) {
		const date = new Date();

		await interaction.deferReply();

		try {
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
			const buf = Buffer.from(json, 'utf8');
			const attachment = new AttachmentBuilder(buf, {
				name: 'dump.json',
				description: $msg.commands.debug.dumpDescription(date)
			});

			await interaction.editReply({ files: [attachment] });
		} catch (err) {
			await interaction.editReply(`Failed to dump database: ${(err as Error).message.toCodeBlock()}`);
		}
	}
}
