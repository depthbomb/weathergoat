import type { CommandInteraction, InteractionReplyOptions } from 'discord.js';

export async function tryToRespond(interaction: CommandInteraction, options: string | InteractionReplyOptions) {
	const { replied, deferred } = interaction;
	if (deferred) {
		return interaction.editReply(options);
	}

	if (replied) {
		if (typeof options === 'string') {
			return interaction.followUp({ content: options, fetchReply: true });
		}

		return interaction.followUp({ ...options, fetchReply: true });
	}

	return interaction.reply(options);
}
