import { db } from '@db';
import { _ } from '@i18n';
import { tokens } from '@container';
import { BaseCommand } from '@commands';
import { DATABASE_PATH } from '@constants';
import { OwnerPrecondition } from '@preconditions/owner';
import { codeBlock, AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import type { Container } from '@container';
import type { IFeaturesService } from '@services/features';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class DebugCommand extends BaseCommand {
	private readonly _features: IFeaturesService;

	public constructor(container: Container) {
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
						{ name: 'Services', value: 'services' },
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

		this._features = container.resolve(tokens.features);

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
			case 'services':
				json = JSON.stringify(Array.from(interaction.client.container.services.keys()), null, 4);
				break;
			case 'jobs':
				const jobs = Array.from(interaction.client.jobs.values());
				json = JSON.stringify(jobs.map(({ job, cron }) => ({
					name: job.name,
					pattern: job.pattern,
					runImmediately: job.runImmediately,
					waitUntilReady: job.waitUntilReady,
					previousRun: cron.previousRun(),
					nextRun: cron.nextRun(),
					msToNextRun: cron.msToNext(),
				})), null, 4);
				break;
			case 'features':
				json = JSON.stringify(this._features.all(), null, 4);
				break;
		}

		await interaction.reply(codeBlock('json', json));
	}

	private async _handleDumpDbSubcommand(interaction: ChatInputCommandInteraction) {
		const date = new Date();
		const path = DATABASE_PATH;

		await interaction.deferReply();

		const alertDestinations = await db.alertDestination.findMany();
		const forecastDestinations = await db.forecastDestination.findMany();
		const autoRadarMessages = await db.autoRadarMessage.findMany();
		const sentAlerts = await db.sentAlert.findMany();
		const volatileMessages = await db.volatileMessage.findMany();

		const json = JSON.stringify({
			date,
			path,
			alertDestinations,
			forecastDestinations,
			autoRadarMessages,
			sentAlerts,
			volatileMessages
		}, null, 4);
		const buf = Buffer.from(json, 'utf8');
		const attachment = new AttachmentBuilder(buf, {
			name: 'dump.json',
			description: _('commands.debug.dumpDescription', { date })
		});

		await interaction.editReply({ files: [attachment] })
	}
}
