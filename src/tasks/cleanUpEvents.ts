import { client } from '@client';
import { logger } from '@logger';
import { database } from '@data';
import type { ITask } from '#ITask';

export default ({
	interval: '5 minutes',
	immediate: true,
	async execute() {
		const destinations = await database.alertDestination.findMany({
			select: {
				guildId: true
			}
		});

		if (!destinations.length) {
			return;
		}

		for (const { guildId } of destinations) {
			const guild = await client.guilds.fetch(guildId);
			if (!guild) {
				continue;
			}

			const events = await guild.scheduledEvents.fetch();
			if (!events.size) {
				continue;
			}

			for (const event of events.values()) {
				if (event.creator !== client.user) {
					continue;
				}

				const now = new Date();
				// Events created by us should ALWAYS have an end date
				if (event.scheduledEndAt! < now) {
					await event.delete();

					logger.info('Removed expired alert event', { id: event.id });
				}
			}
		}
	},
}) satisfies ITask;
