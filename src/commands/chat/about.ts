import { _ } from '@lib/i18n';
import { githubService } from '@services/github';
import { DurationFormatter } from '@sapphire/time-utilities';
import { arch, uptime, version, platform, hostname } from 'node:os';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ICommand } from '@commands';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

interface IAboutCommand extends ICommand {
	[kFormatter]: DurationFormatter;
	[kChangelogSubcommand](interaction: ChatInputCommandInteraction<CacheType>): ReturnType<typeof interaction.editReply>;
	[kStatsSubcommand](interaction: ChatInputCommandInteraction<CacheType>): ReturnType<typeof interaction.reply>;
}

const kFormatter           = Symbol('formatter');
const kChangelogSubcommand = Symbol('changelog-subcommand');
const kStatsSubcommand     = Symbol('stats-command');

export const aboutCommand: IAboutCommand = ({
	data: new SlashCommandBuilder()
	.setName('about')
	.setDescription('Read about me!')
	.addSubcommand(sc => sc
		.setName('changelog')
		.setDescription('Retrieve the latest commits made to my repository')
	)
	.addSubcommand(sc => sc
		.setName('stats')
		.setDescription('Lists some of my technical stats')
	),

	[kFormatter]: new DurationFormatter(),

	async [kChangelogSubcommand](interaction) {
		await interaction.deferReply();

		const messages = await githubService.getCommits(10);
		const response = messages.map(
			msg => `${time(new Date(msg.commit.author!.date!), 'R')} [${msg.commit.message}](${msg.html_url}) by [${msg.commit.author?.name}](${msg.author?.html_url})`
		).join('\n');

		return interaction.editReply(response);
	},
	async [kStatsSubcommand](interaction: ChatInputCommandInteraction<CacheType>) {
		const embed = new EmbedBuilder()
			.setTitle('My Stats')
			.setColor(interaction.client.brandColor)
			.addFields(
				{
					name: 'Uptime',
					value: `Application: ${this[kFormatter].format(interaction.client.uptime ?? 0)}\nSystem: ${this[kFormatter].format(uptime() * 1_000)}`
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
	},

	async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'changelog' | 'stats';
		switch (subcommand) {
			case 'changelog':
				return this[kChangelogSubcommand](interaction);
			case 'stats':
				return this[kStatsSubcommand](interaction);
		}
	}
});
