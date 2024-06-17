import { _ } from '@lib/i18n';
import { Tokens } from '@container';
import { BaseCommand } from '@commands';
import CooldownPrecondition from '@preconditions/cooldown';
import { DurationFormatter } from '@sapphire/time-utilities';
import { arch, uptime, version, platform, hostname } from 'node:os';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Container } from '@container';
import type { IGithubService } from '@services/github';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default class AboutCommand extends BaseCommand {
	private readonly _github: IGithubService;
	private readonly _formatter: DurationFormatter;

	public constructor(container: Container) {
		super({
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
			preconditions: [
				new CooldownPrecondition({ duration: '3s', global: true })
			]
		});

		this._github = container.resolve(Tokens.GitHub);
		this._formatter = new DurationFormatter();
	}

	public async handle(interaction: ChatInputCommandInteraction<CacheType>) {
		const subcommand = interaction.options.getSubcommand(true) as 'changelog' | 'stats';
			switch (subcommand) {
				case 'changelog':
					await this._handleChangelogSubcommand(interaction);
					break;
				case 'stats':
					await this._handleStatsSubcommand(interaction);
					break;
			}
	}

	private async _handleChangelogSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
		await interaction.deferReply();

		const messages = await this._github.getCommits(10);
		const response = messages.map(
			msg => `${time(new Date(msg.commit.author!.date!), 'R')} [${msg.commit.message}](${msg.html_url}) by [${msg.commit.author?.name}](${msg.author?.html_url})`
		).join('\n');

		await interaction.editReply(response);
	}

	private async _handleStatsSubcommand(interaction: ChatInputCommandInteraction<CacheType>) {
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

		await interaction.reply({ embeds: [embed] });
	}
}
