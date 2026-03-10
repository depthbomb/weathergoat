import { db } from '@db';
import { env } from '@env';
import { Color } from '@constants';
import { msg } from '@lib/messages';
import { BaseCommand } from '@commands';
import { reportError } from '@lib/logger';
import { injectable } from '@needle-di/core';
import { OwnerPrecondition } from '@preconditions/owner';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { GuildOnlyInvocationInNonGuildError } from '@lib/errors';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class AboutCommand extends BaseCommand {
	public constructor() {
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
		});

		this.createSubcommandMap<'submit' | 'ban'>({
			submit: {
				handler: this._handleSubmitSubcommand,
				preconditions: [
					new CooldownPrecondition({ duration: '1h' })
				]
			},
			ban: {
				handler: this._handleBanSubcommand,
				preconditions: [
					new OwnerPrecondition()
				]
			}
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleSubmitSubcommand(interaction: ChatInputCommandInteraction) {
		GuildOnlyInvocationInNonGuildError.assert(interaction.guildId);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const isBanned = await db.feedbackBan.exists({ userId: interaction.user.id, active: true });
		if (isBanned) {
			await interaction.editReply(msg.$commandsFeedbackBannedMessage());
			return;
		}

		const content = interaction.options.getString('content', true).trim();
		const embed = new EmbedBuilder()
			.setTitle(msg.$commandsFeedbackEmbedTitle())
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
			await interaction.editReply(msg.$commandsFeedbackErrorMessage());
			return;
		}

		try {
			await owner.send({ embeds: [embed] });
			await interaction.editReply(msg.$commandsFeedbackSuccessMessage());
		} catch (err) {
			reportError('Failed to submit feedback.', err);
			await interaction.editReply(msg.$commandsFeedbackErrorMessage());
		}
	}

	private async _handleBanSubcommand(interaction: ChatInputCommandInteraction) {
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
}
