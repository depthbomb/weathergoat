import { MessageTarget, MessagePayload } from 'discord.js';

export class GenericMessages {
	private constructor() {}

	public static nonexistentChannel(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'The provided channel does not exist in this server.'
		});
	}

	public static commandNotImplemented(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'This command has not been implemented yet.'
		});
	}
}
