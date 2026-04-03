import { env } from '@env';
import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { FeaturesService } from '@services/features';
import { GuildOnlyInvocationInNonGuildError } from '@errors';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class FeedbackCommand extends BaseCommand {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			data: new SlashCommandBuilder()
				.setName('feedback')
				.setDescription('Sends a feedback message to my creator')
				.addStringOption(o => o
					.setName('content')
					.setDescription('The feedback message to send to my creator')
					.setMinLength(20)
					.setMaxLength(1000)
					.setRequired(true)
				),
			preconditions: [
				new CooldownPrecondition({ duration: '1h' })
			]
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		if (this.features.isFeatureEnabled('disableFeedbackSubmissions')) {
			await interaction.reply($msg.features.disabled());
			return;
		}

		GuildOnlyInvocationInNonGuildError.assert(interaction.guildId);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const isBanned = await db.feedbackBan.exists({ userId: interaction.user.id, active: true });
		if (isBanned) {
			await interaction.editReply($msg.commands.feedback.banned());
			return;
		}

		const content = interaction.options.getString('content', true).trim();
		const embed = new EmbedBuilder()
			.setTitle($msg.commands.feedback.embed.title())
			.setColor(Color.Success)
			.setDescription(`>>> ${content}`)
			.addFields([
				{
					name: 'User',
					value: `${interaction.user.username} (${interaction.user.id})`
				},
				{
					name: 'Guild',
					value: `${interaction.guild?.name} (${interaction.guild?.id})`
				},
			]);

		const owner = await interaction.client.users.fetch(env.get('BOT_OWNER_ID'));
		if (!owner) {
			this.logger.error('Failed to retrieve owner to submit feedback to.');
			await interaction.editReply($msg.commands.feedback.error());
			return;
		}

		try {
			await owner.send({ embeds: [embed] });
			await interaction.editReply($msg.commands.feedback.success());
		} catch (err) {
			reportError('Failed to submit feedback.', err);
			await interaction.editReply($msg.commands.feedback.error());
		}
	}
}
