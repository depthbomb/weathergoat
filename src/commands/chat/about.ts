import { _ } from '@lib/i18n';
import { Tokens } from '@container';
import { Colors } from '@constants';
import { BaseCommand } from '@commands';
import { isDiscordAPIErrorCode } from '@lib/errors';
import { DurationFormatter } from '@sapphire/time-utilities';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { arch, uptime, version, platform, hostname } from 'node:os';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Container } from '@container';
import type { IGithubService } from '@services/github';
import type { ChatInputCommandInteraction } from 'discord.js';

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
			)
		});

		this._github = container.resolve(Tokens.GitHub);
		this._formatter = new DurationFormatter();

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

		const messages = await this._github.getCommits(10);
		const response = messages.map(
			msg => `${time(new Date(msg.commit.author!.date!), 'R')} [${msg.commit.message}](${msg.html_url}) by [${msg.commit.author?.name}](${msg.author?.html_url})`
		).join('\n');

		try {
			await interaction.editReply(response);
		} catch (err) {
			if (isDiscordAPIErrorCode(err, 50035)) {
				await interaction.editReply(`A preview of my commits is currently too large to send. You can view my commits [here](https://github.com/depthbomb/weathergoat/commits).`);
			} else {
				throw err;
			}
		}
	}

	private async _handleStatsSubcommand(interaction: ChatInputCommandInteraction) {
		const embed = new EmbedBuilder()
		.setTitle('My Stats')
		.setColor(Colors.Primary)
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
