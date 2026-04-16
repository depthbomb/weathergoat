import { db } from '@database';
import { $msg } from '@lib/messages';
import { reportError } from '@lib/logger';
import { generateSnowflake } from '@lib/snowflake';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	CountSubscriptions = 'count-subscriptions',
	Create             = 'create',
}

export default class AnnouncementsCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'announcements',
			description: 'Announcement management commands',
			subcommands: {
				[Subcommands.CountSubscriptions]: {},
				[Subcommands.Create]: [
					LegacyCommandParam.string('title'),
					LegacyCommandParam.string('body', { rest: true }),
				],
			},
		});
	}

	public async [Subcommands.CountSubscriptions](message: Message) {
		try {
			const count = await db.announcementSubscription.count();
			await message.reply($msg.legacyCommands.announcements.count.success(count));
		} catch (err) {
			reportError('Unable to count announcement records', err);
			await message.reply(
				$msg.legacyCommands.announcements.count.error(
					(err as Error).name,
					(err as Error).stack,
				)
			);
		}
	}

	public async [Subcommands.Create](message: Message) {
		const title = this.ctx.params.getString('title', true).trim();
		const body  = this.ctx.params.getString('body', true).trim();

		if (!title.length || !body.length) {
			await message.reply({ content: $msg.legacyCommands.announcements.create.emptyTitleOrBody() });
			return;
		}

		const snowflake = generateSnowflake();

		try {
			const announcement = await db.announcement.create({
				data: {
					snowflake,
					title,
					body
				}
			});

			const subscriptions = await db.announcementSubscription.findMany();
			const deliveries    = subscriptions.map(s => ({ announcementId: announcement.id, subscriptionId: s.id }));

			await db.announcementDelivery.createMany({ data: deliveries });
			await message.reply($msg.legacyCommands.announcements.create.success());
		} catch (err) {
			reportError('Unable to create announcement record', err, { snowflake });
			await message.reply(
				$msg.legacyCommands.announcements.create.error(
					(err as Error).name,
					(err as Error).stack,
				)
			);
		}
	}
}
