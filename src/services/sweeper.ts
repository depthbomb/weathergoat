import { db } from '@db';
import { Tokens } from '@container';
import { captureError } from '@lib/errors';
import { Duration } from '@sapphire/time-utilities';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { Prisma } from '@db';
import type { Message } from 'discord.js';
import type { IService } from '@services';
import type { Container } from '@container';
import type { WeatherGoat } from '@lib/client';

export interface ISweeperService extends IService {
	/**
	 * Returns all message records that should be sweeped at the time of calling this method.
	 */
	getDueMessages(): Promise<Prisma.PromiseReturnType<typeof db.volatileMessage.findMany>>;
	/**
	 * Enqueues a message to be deleted at a later time.
	 *
	 * @param guildId The ID of the guild that the message is in.
	 * @param channelId The ID of the channel that the message is in.
	 * @param messageId The ID of the message.
	 * @param expires The duration string (for example `1 day`) that the message should last for or
	 * the {@link Date} in which the message should be sweeped.
	 */
	enqueueMessage(guildId: string, channelId: string, messageId: string, expires: string | Date): Promise<void>;
	/**
	 * Enqueues a message to be deleted at a later time.
	 *
	 * @param message The message.
	 * @param expires The duration string (for example `1 day`) that the message should last for or
	 * the {@link Date} in which the message should be sweeped.
	 */
	enqueueMessage(message: Message<boolean>, expires: string | Date): Promise<void>;
	/**
	 * Iterates and deletes volatile messages and their corresponding database record if they should
	 * be sweeped at the time of calling.
	 *
	 * @returns An array with the following structure: `[sweepCount, errorCount]`.
	 *
	 * @remark `errorCount` merely refers to the number of errors as the result of a message not being
	 * retrieved properly from the Discord API. This can happen for various reasons and is usually
	 * through no fault of our own. The corresponding database record is deleted regardless.
	 */
	sweepMessages(): Promise<number[]>;
}

export default class SweeperService implements ISweeperService {
	private readonly _client: WeatherGoat<true>;

	public constructor(container: Container) {
		this._client = container.resolve(Tokens.Client);
	}

	public async getDueMessages() {
		const messages = await db.volatileMessage.findMany({
			where: {
				expiresAt: { lte: new Date() }
			}
		});

		return messages;
	}

	public async enqueueMessage(arg1: string | Message<boolean>, arg2: string, arg3?: string, arg4?: string | Date): Promise<void> {
		let guildId: string;
		let channelId: string;
		let messageId: string;
		let expiresAt: Date;
		if (typeof arg1 === 'string') {
			// arg1 = guildId, arg2 = channelId, arg3 = messageId, arg4 = expires
			guildId = arg1;
			channelId = arg2;
			messageId = arg3!;
			expiresAt = typeof arg4! === 'string' ? new Duration(arg4!).fromNow : arg4!;
		} else {
			// arg1 = message, arg2 = expires
			if (!arg1.guildId) {
				throw new Error('Message does not belong to a guild.');
			}

			guildId = arg1.guildId;
			channelId = arg1.channelId;
			messageId = arg1.id;
			expiresAt = typeof arg2 === 'string' ? new Duration(arg2).fromNow : arg2;
		}

		await db.volatileMessage.create({
			data: {
				guildId,
				channelId,
				messageId,
				expiresAt
			}
		});
	}

	public async sweepMessages() {
		let sweepCount = 0;
		let errorCount = 0;
		const messages = await this.getDueMessages();
		for (const { id, channelId, messageId } of messages) {
			try {
				const channel = await this._client.channels.fetch(channelId);
				if (isTextChannel(channel)) {
					const message = await channel.messages.fetch(messageId);
					if (message) {
						await message.delete();
						sweepCount++;
					}
				}
			} catch (err) {
				errorCount++;
				captureError('Error while deleting volatile message', err, { channelId, messageId });
			} finally {
				await db.volatileMessage.delete({ where: { id } });
			}
		}

		return [sweepCount, errorCount];
	}
}
