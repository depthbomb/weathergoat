import { client } from '@client';
import { logger } from '@logger';
import { database } from '@data';
import type { ITask } from '#ITask';

export default ({
	interval: '1 minute',
	immediate: true,
	async execute() {
		const now     = new Date();
		const query   = { where: { expires: { lte: now } } };
		const records = await database.volatileMessage.findMany(query);
		if (!records.length) {
			return;
		}

		for (const { guildId, channelId, messageId } of records) {
			const message = await fetchVolatileMessage(guildId, channelId,  messageId);
			if (!message) {
				continue;
			}

			try {
				await message.delete();
				await database.volatileMessage.deleteMany(query);

				logger.debug('Deleted volatile message', { messageId });
			} catch (err: unknown) {
				logger.error('Error while deleting volatile message', { err });
			}
		}
	},
}) satisfies ITask;

async function fetchVolatileMessage(guildId: string, channelId: string, messageId: string) {
	try {
		const guild = await client.guilds.fetch(guildId);
		if (!guild) {
			return null;
		}

		const channel = await guild.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) {
			return null;
		}

		const message = await channel.messages.fetch(messageId);
		if (!message) {
			return null;
		}

		return message;
	} catch {
		return null;
	}
}
