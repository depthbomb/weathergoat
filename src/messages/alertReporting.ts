import { MessageFlags, MessageTarget, MessagePayload, channelMention } from 'discord.js';

export class AlertReportingMessages {
	private constructor() {}

	public static limitReached(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'The maximum amount of alert destinations for this server has been reached. Please delete some to make more.'
		});
	}

	public static destinationCreated(target: MessageTarget, autoCleanup: boolean, snowflake: string): MessagePayload {
		let content = 'Alert reporting created!';

		if (autoCleanup) {
			content = content.concat(' ', 'My messages will automatically be deleted after some time.');
		}

		content = content.concat('\n', `You can remove this reporting by using the \`/remove\` command and using the snowflake: \`${snowflake}\`.`);

		return new MessagePayload(target, {
			content,
			flags: MessageFlags.SuppressNotifications
		});
	}

	public static destinationRemoved(target: MessageTarget, channelId: string): MessagePayload {
		return new MessagePayload(target, {
			content: `Alert reporting has been removed from ${channelMention(channelId)}.`,
			flags: MessageFlags.SuppressNotifications
		});
	}

	public static destinationExists(target: MessageTarget, channelId: string): MessagePayload {
		return new MessagePayload(target, {
			content: `I'm already reporting alerts for that location to ${channelMention(channelId)}.`
		});
	}

	public static destinationCreateFailed(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'Failed to create alert destination.'
		});
	}

	public static destinationNonexistent(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'No alert reporting record exists in this server with the provided snowflake.'
		});
	}

	public static destinationRemoveFailed(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'Failed to remove alert reporting.'
		});
	}
}
