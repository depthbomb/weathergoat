import { _ } from '@lib/i18n';
import { Tokens } from '@container';
import { BaseCommand } from '@commands';
import { codeBlock, SlashCommandBuilder } from 'discord.js';
import type { Container } from '@container';
import type { IFeaturesService } from '@services/features';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

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
		});

		this._features = container.resolve(Tokens.Features);

		this.createSubcommandMap<'print'>({
			print: {
				handler: this._handlePrintSubcommand,
			}
		});
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		await this.handleSubcommand(interaction);
	}

	private async _handlePrintSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const domain = interaction.options.getString('domain', true) as 'services' | 'jobs' | 'features';
		let json: string = '';
		switch (domain) {
			case 'services':
				json = JSON.stringify(Array.from(interaction.client.container.services.keys()), null, 4);
				break;
			case 'jobs':
				const jobs = Array.from(interaction.client.jobs.values());
				json = JSON.stringify(
					jobs.map(j => ({ name: j.name, pattern: j.pattern, runImmediately: j.runImmediately, waitUntilReady: j.waitUntilReady })),
					null,
					4
				);
				break;
			case 'features':
				json = JSON.stringify(this._features.all(), null, 4);
				break;
		}

		await interaction.reply(codeBlock('json', json));
	}
}
