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
import {
	createErrorMessageComponent,
	createSuccessMessageComponent,
	createWarningMessageComponent
} from '@utils/components';
import type { ChatInputCommandInteraction } from 'discord.js';

export class FeedbackCommand extends BaseCommand {
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
				)
				.addBooleanOption(o => o
					.setName('allow-followup')
					.setDescription('Allow my creator to reply to your feedback? Only one reply will be sent.')
					.setRequired(true)
				),
			preconditions: [
				new CooldownPrecondition({ duration: '1h' })
			]
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		if (this.features.isFeatureEnabled('disableFeedbackSubmissions')) {
			await interaction.reply({
				components: [createWarningMessageComponent($msg.shared.featureDisabled())],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		GuildOnlyInvocationInNonGuildError.assert(interaction.guildId);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const isBanned = await db.feedbackBan.exists({ userId: interaction.user.id, active: true });
		if (isBanned) {
			await interaction.editReply({
				components: [createErrorMessageComponent($msg.feedback.command.banned())],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const content       = interaction.options.getString('content', true).trim();
		const allowFeedback = interaction.options.getBoolean('allow-followup', true);

		const embed = new EmbedBuilder()
			.setTitle($msg.feedback.command.embed.title())
			.setColor(Color.Success)
			.setDescription(`>>> ${content}`)
			.addFields([
				{
					name: $msg.feedback.command.embed.fields.user(),
					value: `${interaction.user.username} (${interaction.user.id})`
				},
				{
					name: $msg.feedback.command.embed.fields.guild(),
					value: `${interaction.guild?.name} (${interaction.guild?.id})`
				},
				{
					name: $msg.feedback.command.embed.fields.openToFeedback(),
					value: allowFeedback ? '✔' : '❌'
				},
			]);

		const owner = await interaction.client.users.fetch(env.get('BOT_OWNER_ID'));
		if (!owner) {
			this.logger.error('Failed to retrieve owner to submit feedback to.');
			await interaction.editReply({
				components: [createErrorMessageComponent($msg.feedback.command.error())],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		try {
			await owner.send({ embeds: [embed] });
			await interaction.editReply({
				components: [createSuccessMessageComponent($msg.feedback.command.success())],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (err) {
			reportError('Failed to submit feedback.', err);
			await interaction.editReply({
				components: [createErrorMessageComponent($msg.feedback.command.error())],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}
}
