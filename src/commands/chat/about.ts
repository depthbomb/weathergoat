import { _ } from '@lib/i18n';
import { Git } from '@utils/git';
import { Command } from '@commands';
import { DurationFormatter } from '@sapphire/time-utilities';
import { arch, uptime, version, platform, hostname } from 'node:os';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class AboutCommand extends Command {
	private readonly _formatter: DurationFormatter;

	public constructor() {
		super(new SlashCommandBuilder()
			.setName('about')
			.setDescription('Read about me!')
			.addSubcommand(sc => sc
				.setName('changelog')
				.setDescription('Read the last 12 commit messages made to my repository')
			)
			.addSubcommand(sc => sc
				.setName('stats')
				.setDescription('Lists some of my technical stats')
			)
		);

		this._formatter = new DurationFormatter();
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'changelog' | 'stats';
		switch (subcommand) {
			case 'changelog':
				return this._changelogSubcommand(interaction);
			case 'stats':
				return this._statsSubcommand(interaction);
		}
	}

	private async _changelogSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const messages = await Git.getCommitMessages(12);
		const response = messages.map(
			msg => `${time(msg.date, 'R')} [${msg.message}](https://github.com/depthbomb/weathergoat/commit/${msg.shortHash}) by ${msg.authorName}`
		).join('\n');

		return interaction.reply(response);
	}

	private async _statsSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		const embed = new EmbedBuilder()
			.setTitle('My Stats')
			.setColor(interaction.client.brandColor)
			.addFields(
				{
					name: 'Uptime',
					value: `Application: ${this._formatter.format(interaction.client.uptime ?? 0)}\nSystem: ${this._formatter.format(uptime() * 1_000)}`
				},
				{
					name: 'Runtime',
					value: `Bun ${Bun.version} (${Bun.revision.slice(0, 7)})`
				},
				{
					name: 'System',
					value: `${version()} (${platform()}) ${arch()}`
				},
				{
					name: 'Host Name',
					value: hostname()
				}
			);

		return interaction.reply({ embeds: [embed] });
	}
}
