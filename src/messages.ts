import { _ } from '@i18n';
import { Color } from '@constants';
import { EmbedBuilder } from 'discord.js';
import { MaxDestinationError } from '@errors';
import { MessageBuilder } from '@sapphire/discord.js-utilities';
import type { WeatherGoatError } from '@errors';
import type { PreconditionError } from '@preconditions';

function createErrorEmbed(message: string, footerText?: string) {
	const embed = new EmbedBuilder()
		.setColor(Color.Danger)
		.setDescription(message)
		.setTimestamp();

	if (footerText) {
		embed.setFooter({ text: footerText });
	}

	return embed;
}

export function WEATHERGOAT_ERROR(err: WeatherGoatError) {
	let message = err.message;
	if (err instanceof MaxDestinationError) {
		message = `${message} (${err.max})`;
	}

	return new MessageBuilder().setEmbeds([
		createErrorEmbed(message, err.name)
	]);
}

export function PRECONDITION_ERROR(err: PreconditionError) {
	return new MessageBuilder().setEmbeds([
		createErrorEmbed(err.message)
	]);
}

export function INTERACTION_ERROR() {
	return new MessageBuilder().setEmbeds([
		createErrorEmbed(_('events.interactions.err.commandError'))
	]);
}
