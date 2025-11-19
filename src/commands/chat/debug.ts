import { db } from '@db';
import { msg } from '@lib/messages';
import { container } from '@container';
import { BaseCommand } from '@commands';
import { FeaturesService } from '@services/features';
import { OwnerPrecondition } from '@preconditions/owner';
import { codeBlock, AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class DebugCommand extends BaseCommand {
	private readonly features: FeaturesService;

	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('debug')
			.setDescription('Owner-only debug commands')
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
			),
			preconditions: [
				new OwnerPrecondition()
			]
		});

		this.features = container.resolve(FeaturesService);

		this.createSubcommandMap<'print' | 'dump-db'>({
			print: { handler: this._handlePrintSubcommand },
			'dump-db': { handler: this._handleDumpDbSubcommand }
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handlePrintSubcommand(interaction: ChatInputCommandInteraction) {
		const domain = interaction.options.getString('domain', true) as 'services' | 'jobs' | 'features';
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

		await interaction.reply(codeBlock('json', json));
	}

	private async _handleDumpDbSubcommand(interaction: ChatInputCommandInteraction) {
		const date = new Date();

		await interaction.deferReply();

		const alertDestinations    = await db.alertDestination.findMany();
		const forecastDestinations = await db.forecastDestination.findMany();
		const autoRadarMessages    = await db.autoRadarMessage.findMany();
		const sentAlerts           = await db.sentAlert.findMany();
		const volatileMessages     = await db.volatileMessage.findMany();

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
			description: msg.$commandsDebugDumpDescription(date)
		});

		await interaction.editReply({ files: [attachment] })
	}
}
