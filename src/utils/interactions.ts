import type { CommandInteraction, InteractionReplyOptions, InteractionEditReplyOptions } from 'discord.js';

type ReplyLike = string | InteractionReplyOptions | InteractionEditReplyOptions;

export async function tryToRespond(interaction: CommandInteraction, options: ReplyLike) {
	const { replied, deferred } = interaction;
	if (deferred) {
		if (typeof options === 'string' || 'files' in options || 'content' in options) {
			return interaction.editReply(options as string | InteractionEditReplyOptions);
		}

		const editOpts: InteractionEditReplyOptions = {
			content: (options as InteractionReplyOptions).content ?? null,
		};

		return interaction.editReply(editOpts);
	}

	if (replied) {
		if (typeof options === 'string') {
			return interaction.followUp({ content: options, withResponse: true });
		}

		return interaction.followUp({
			...(options as InteractionReplyOptions),
			withResponse: true,
		});
	}

	if (typeof options === 'string') {
		return interaction.reply(options);
	}

	return interaction.reply(options as InteractionReplyOptions);
}
