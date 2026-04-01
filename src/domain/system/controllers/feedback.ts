import { env } from '@env';
import { db } from '@database';
import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { FeaturesService } from '@services/features';
import { inject, injectable } from '@needle-di/core';
import { OwnerPrecondition } from '@preconditions/owner';
import { GuildOnlyInvocationInNonGuildError } from '@errors';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { subcommand, BaseInteractionController } from '@infra/controllers';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class FeedbackController extends BaseInteractionController {
	public constructor(
		private readonly features = inject(FeaturesService)
	) {
		super({
			data: new SlashCommandBuilder()
			.setName('feedback')
			.setDescription('Commands related to submitting feedback')
			.addSubcommand(sc => sc
				.setName('submit')
				.setDescription('Sends a feedback message to my creator')
				.addStringOption(o => o
					.setName('content')
					.setDescription('The feedback message to send to my creator')
					.setMinLength(20)
					.setMaxLength(1000)
					.setRequired(true)
				)
			)
			.addSubcommand(sc => sc
				.setName('ban')
				.setDescription('Bans a user from submitting feedback. Owner only.')
				.addStringOption(o => o
					.setName('user-id')
					.setDescription('The ID of the user to ban from submitting feedback.')
					.setRequired(true)
				)
				.addStringOption(o => o
					.setName('reason')
					.setDescription('The ID of the user to ban from submitting feedback.')
					.setRequired(false)
				)
			)
			.addSubcommand(sc => sc
				.setName('unban')
				.setDescription('Unbans a user from submitting feedback. Owner only.')
				.addStringOption(o => o
					.setName('user-id')
					.setDescription('The ID of the user to unban from submitting feedback.')
					.setRequired(true)
				)
			)
		});
	}

	@subcommand('submit', new CooldownPrecondition({ duration: '1h' }))
	public async handleSubmitSubcommand(interaction: ChatInputCommandInteraction) {
		if (this.features.isFeatureEnabled('disableFeedbackSubmissions')) {
			await interaction.reply($msg.features.disabled());
			return;
		}

		GuildOnlyInvocationInNonGuildError.assert(interaction.guildId);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const isBanned = await db.feedbackBan.exists({ userId: interaction.user.id, active: true });
		if (isBanned) {
			await interaction.editReply($msg.commands.feedback.submit.banned());
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
			await interaction.editReply($msg.commands.feedback.submit.error());
			return;
		}

		try {
			await owner.send({ embeds: [embed] });
			await interaction.editReply($msg.commands.feedback.submit.success());
		} catch (err) {
			reportError('Failed to submit feedback.', err);
			await interaction.editReply($msg.commands.feedback.submit.error());
		}
	}

	@subcommand('ban', new OwnerPrecondition())
	public async handleBanSubcommand(interaction: ChatInputCommandInteraction) {
		const userId = interaction.options.getString('user-id', true);
		const reason = interaction.options.getString('reason') ?? 'No reason specified.';

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			await db.feedbackBan.create({ data: { userId, reason } });
			await interaction.editReply('Feedback ban successfully saved.');
		} catch (err) {
			await interaction.editReply(`Unable to save feedback ban: ${(err as Error).stack?.toCodeBlock()}`);
		}
	}

	@subcommand('unban', new OwnerPrecondition())
	public async handleUnbanSubcommand(interaction: ChatInputCommandInteraction) {
		const userId = interaction.options.getString('user-id', true);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			await db.feedbackBan.delete({ where: { userId } });
			await interaction.editReply('Feedback ban successfully lifted.');
		} catch (err) {
			await interaction.editReply(`Unable to lift feedback ban: ${(err as Error).stack?.toCodeBlock()}`);
		}
	}
}
