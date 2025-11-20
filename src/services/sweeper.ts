import { db } from '@db';
import { logger } from '@lib/logger';
import { WeatherGoat } from '@lib/client';
import { Duration } from '@sapphire/duration';
import { inject, injectable } from '@needle-di/core';
import { isTextChannel } from '@sapphire/discord.js-utilities';
import type { LogLayer } from 'loglayer';
import type { Message } from 'discord.js';
import type { PromiseReturnType } from '@prisma/client';

@injectable()
export class SweeperService {
	private readonly logger: LogLayer;

	public constructor(
		private readonly bot = inject(WeatherGoat)
	) {
		this.logger = logger.child().withPrefix(SweeperService.name.bracketWrap());
	}

	/**
	 * Returns all message records that should be sweeped at the current date.
	 */
	public getDueMessages(): Promise<PromiseReturnType<typeof db.volatileMessage.findMany>> {
		const now = new Date();
		return db.volatileMessage.findMany({
			where: {
				expiresAt: { lte: now }
			}
		});
	}

	/**
	 * Enqueues a message to be deleted at a later time. If the record already exists then it is
	 * updated with the new time instead.
	 *
	 * @param guildId The ID of the guild that the message is in.
	 * @param channelId The ID of the channel that the message is in.
	 * @param messageId The ID of the message.
	 * @param expires The duration string (e.g. `1 day`) or Date when the message should be swept.
	 */
	public async enqueueMessage(guildId: string, channelId: string, messageId: string, expires: string | Date): Promise<void>;
	/**
	 * Enqueues a message to be deleted at a later time. If the record already exists then it is
	 * updated with the new time instead.
	 *
	 * @param message The message.
	 * @param expires The duration string (e.g. `1 day`) or Date when the message should be swept.
	 */
	public async enqueueMessage(message: Message<boolean>, expires: string | Date): Promise<void>;
	public async enqueueMessage(arg1: string | Message<boolean>, arg2: string | Date, arg3?: string, arg4?: string | Date): Promise<void> {
		let guildId: string;
		let channelId: string;
		let messageId: string;
		let expiresAt: Date;

		if (typeof arg1 === 'string') {
			// arg1 = guildId, arg2 = channelId, arg3 = messageId, arg4 = expires
			guildId = arg1;
			channelId = arg2 as string;
			messageId = arg3!;
			expiresAt = typeof arg4 === 'string' ? new Duration(arg4).fromNow : arg4!;
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

		await db.volatileMessage.upsert({
			where: {
				guildId,
				channelId,
				messageId
			},
			update: {
				expiresAt
			},
			create: {
				guildId,
				channelId,
				messageId,
				expiresAt
			}
		});
	}

	/**
	 * Iterates and deletes volatile messages and their corresponding DB record if they should
	 * be swept now.
	 *
	 * @returns A tuple: [sweepCount, errorCount]
	 */
	public async sweepMessages(): Promise<number[]> {
		let sweepCount = 0;
		let errorCount = 0;
		const messages = await this.getDueMessages();

		for (const { id, channelId, messageId } of messages) {
			try {
				const channel = await this.bot.channels.fetch(channelId);
				if (isTextChannel(channel)) {
					const message = await channel.messages.fetch(messageId);
					if (message) {
						await message.delete();
						sweepCount++;
					}
				}
			} catch (err) {
				errorCount++;
				this.logger.withMetadata({ id, channelId, messageId, err }).error('Error while deleting volatile message');
			} finally {
				await db.volatileMessage.delete({ where: { id } });
			}
		}

		return [sweepCount, errorCount];
	}
}

