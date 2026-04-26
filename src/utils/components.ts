import { Color, EMOJI } from '@constants';
import { ContainerBuilder } from 'discord.js';

export function createMessageComponent(text: string, accentColor = Color.Primary) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent(text));
}

export function createSuccessMessageComponent(text: string) {
	return createMessageComponent(`${EMOJI.success} ${text}`, Color.Success);
}

export function createWarningMessageComponent(text: string) {
	return createMessageComponent(`${EMOJI.warning} ${text}`, Color.Warning);
}

export function createErrorMessageComponent(text: string) {
	return createMessageComponent(`${EMOJI.error} ${text}`, Color.Danger);
}
