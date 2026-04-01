import { $msg } from '@lib/messages';
import { Color, CALVER } from '@constants';
import { uptime, hostname } from 'node:os';
import { injectable } from '@needle-di/core';
import { BaseCommand } from '@infra/commands';
import { DurationFormatter } from '@sapphire/duration';
import { MessageFlags, ContainerBuilder, SlashCommandBuilder, SeparatorSpacingSize } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AboutCommand extends BaseCommand {
	private readonly formatter = new DurationFormatter();

	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('about')
			.setDescription('Read about me!')
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		const bunCommitSha = Bun.revision.slice(0, 7);
		const bunCommitUrl = `https://github.com/oven-sh/bun/commit/${bunCommitSha}`;

		const container = new ContainerBuilder()
			.setAccentColor(Color.Primary)
			.addSectionComponents(s => s
				.addTextDisplayComponents(d => d.setContent($msg.commands.about.title(CALVER)))
				.setThumbnailAccessory(tn => tn.setURL(interaction.client.user.avatarURL()!))
			)
			.addTextDisplayComponents(d => d.setContent($msg.commands.about.gutsSection(
				bunCommitSha.toHyperlink(bunCommitUrl),
				hostname(),
				this.formatter.format(uptime() * 1_000),
				this.formatter.format(interaction.client.uptime ?? 0)
			)))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
			.addTextDisplayComponents(d => d.setContent($msg.commands.about.dataSourceSection()))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
			.addTextDisplayComponents(d => d.setContent($msg.commands.about.aiUsageSection()));

		await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
	}
}
