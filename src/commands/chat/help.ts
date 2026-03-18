import { BaseCommand } from '@commands';
import { GithubService } from '@services/github';
import { SlashCommandBuilder } from 'discord.js';
import { inject, injectable } from '@needle-di/core';
import { DurationFormatter } from '@sapphire/duration';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AbouHelpCommand extends BaseCommand {
	private readonly formatter: DurationFormatter;

	public constructor(
		private readonly github = inject(GithubService)
	) {
		super({
			data: new SlashCommandBuilder()
			.setName('help')
			.setDescription('Read about me!')
		});

		this.formatter = new DurationFormatter();
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		// TODO consolidate subcommands into single command
	}
}
