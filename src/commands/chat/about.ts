import { msg } from '@lib/messages';
import { BaseCommand } from '@commands';
import { GithubService } from '@services/github';
import { inject, injectable } from '@needle-di/core';
import { DurationFormatter } from '@sapphire/duration';
import { MessageLimits } from '@sapphire/discord-utilities';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { REPO, Color, REPO_NAME, REPO_OWNER } from '@constants';
import { arch, uptime, version, platform, hostname } from 'node:os';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AboutCommand extends BaseCommand {
	private readonly formatter: DurationFormatter;

	public constructor(
		private readonly github = inject(GithubService)
	) {
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
			)
		});

		this.formatter = new DurationFormatter();

		this.createSubcommandMap<'changelog' | 'stats'>({
			changelog: {
				handler: this._handleChangelogSubcommand,
				preconditions: [
					new CooldownPrecondition({ duration: '3s', global: true })
				]
			},
			stats: {
				handler: this._handleStatsSubcommand
			}
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleChangelogSubcommand(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		const messages = await this.github.getCommits(10);
		const response = messages.map(
			msg => {
				const commitUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${msg.sha.slice(0, 7)}`;
				`${time(new Date(msg.commit.author!.date!), 'R')} [${msg.commit.message}](${commitUrl}) - [${msg.commit.author?.name}](${msg.author?.html_url})`
			}
		).join('\n');

		if (response.length > MessageLimits.MaximumLength) {
			await interaction.editReply(msg.$commandsAboutResponseTooLong(REPO));
		} else {
			await interaction.editReply(response);
		}
	}

	private async _handleStatsSubcommand(interaction: ChatInputCommandInteraction) {
		const bunCommitSha = Bun.revision.slice(0, 7);
		const bunCommitUrl = `https://github.com/oven-sh/bun/commit/${Bun.revision.slice(0, 7)}`;
		const embed = new EmbedBuilder()
			.setTitle(msg.$commandsAboutMyStatsTitle())
			.setColor(Color.Primary)
			.addFields(
				{
					name: msg.$commandsAboutUptimeTitle(),
					value: `- ${msg.$commandsAboutApplicationPrefix()} ${this.formatter.format(interaction.client.uptime ?? 0)}\n- ${msg.$commandsAboutSystemPrefix()} ${this.formatter.format(uptime() * 1_000)}`
				},
				{
					name: msg.$commandsAboutRuntimeTitle(),
					value: `Bun ${Bun.version} ([${bunCommitSha}](${bunCommitUrl}))`
				},
				{
					name: msg.$commandsAboutSystemTitle(),
					value: `${version()} (${platform()}) ${arch()}`
				},
				{
					name: msg.$commandsAboutHostNameTitle(),
					value: hostname()
				}
			);

		await interaction.reply({ embeds: [embed] });
	}
}
