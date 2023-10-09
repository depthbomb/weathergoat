import { GenericMessages } from '@messages';
import type { ChatInputCommandInteraction } from 'discord.js';

export async function commandNotImplemented(interaction: ChatInputCommandInteraction) {
	return interaction.reply(GenericMessages.commandNotImplemented(interaction));
}
