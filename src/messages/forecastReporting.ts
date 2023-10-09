import { MessageFlags, MessageTarget, MessagePayload, channelMention } from 'discord.js';

export class ForecastReportingMessages {
	private constructor() {}

	public static limitReached(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'The maximum amount of forecast destinations for this server has been reached. Please delete some to make more.'
		});
	}

	public static destinationRemoved(target: MessageTarget, channelId: string): MessagePayload {
		return new MessagePayload(target, {
			content: `Forecast reporting has been removed from ${channelMention(channelId)}.`,
			flags: MessageFlags.SuppressNotifications
		});
	}

	public static destinationCreated(target: MessageTarget, autoCleanup: boolean, snowflake: string): MessagePayload {
		let content = 'Forecast reporting created!';

		if (autoCleanup) {
			content = content.concat(' ', 'My messages will automatically be deleted after some time.');
		}

		content = content.concat('\n', `You can remove this reporting by using the \`/remove\` command and using the snowflake: \`${snowflake}\`.`);

		return new MessagePayload(target, {
			content,
			flags: MessageFlags.SuppressNotifications
		});
	}

	public static destinationNonexistent(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'No alert reporting record exists in this server with the provided snowflake.'
		});
	}

	public static destinationRemoveFailed(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'Failed to remove forecast reporting.'
		});
	}

	public static destinationCreateFailed(target: MessageTarget): MessagePayload {
		return new MessagePayload(target, {
			content: 'Failed to create forecast destination.'
		});
	}
}

