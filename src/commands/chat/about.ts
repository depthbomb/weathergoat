import { _ } from '@i18n';
import { tokens } from '@container';
import { BaseCommand } from '@commands';
import { REPO, Color } from '@constants';
import { MessageLimits } from '@sapphire/discord-utilities';
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

		this._github = container.resolve(tokens.github);
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
			msg => `${time(new Date(msg.commit.author!.date!), 'R')} [${msg.commit.message}](${msg.html_url}) - [${msg.commit.author?.name}](${msg.author?.html_url})`
		).join('\n');

		if (response.length > MessageLimits.MaximumLength) {
			await interaction.editReply(_('commands.about.responseTooLong', { repo: REPO }));
		} else {
			await interaction.editReply(response);
		}
	}

	private async _handleStatsSubcommand(interaction: ChatInputCommandInteraction) {
		const embed = new EmbedBuilder()
		.setTitle(_('commands.about.myStatsTitle'))
		.setColor(Color.Primary)
		.addFields(
			{
				name: _('commands.about.uptimeTitle'),
				value: `${_('commands.about.applicationPrefix')} ${this._formatter.format(interaction.client.uptime ?? 0)}\n${_('commands.about.systemPrefix')} ${this._formatter.format(uptime() * 1_000)}`
			},
			{
				name: _('commands.about.runtimeTitle'),
				value: `Bun ${Bun.version} (${Bun.revision.slice(0, 7)})`
			},
			{
				name: _('commands.about.systemTitle'),
				value: `${version()} (${platform()}) ${arch()}`
			},
			{
				name: _('commands.about.hostNameTitle'),
				value: hostname()
			}
		);

		await interaction.reply({ embeds: [embed] });
	}
}
