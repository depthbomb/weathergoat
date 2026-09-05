import { db } from '@database';
import { inject } from '@needle-di/core';
import { BaseEvent } from '@infra/events';
import { EventBusService } from '@services/event-bus';
import type { Guild } from 'discord.js';

export class GuildDeleteEvent extends BaseEvent<'guildDelete'> {
	public constructor(private readonly eventBus = inject(EventBusService)) {
		super({ name: 'guildDelete' });
	}

	public async handle(guild: Guild) {
		// Clean up database records that we no longer need if we are no longer operating inside of
		// the related guild.

		const where = { guildId: guild.id };

		this.logger
			.withMetadata({ id: guild.id, name: guild.name })
			.info('No longer operating in a guild, cleaning up database');

		await db.orm.public.AlertDestination.where(where)
			.deleteAndCount()
			.then((count) => ({ count }));
		await db.orm.public.ForecastDestination.where(where)
			.deleteAndCount()
			.then((count) => ({ count }));
		await db.orm.public.AutoRadarMessage.where(where)
			.deleteAndCount()
			.then((count) => ({ count }));
		await db.orm.public.VolatileMessage.where(where)
			.deleteAndCount()
			.then((count) => ({ count }));
		await db.orm.public.SentAlert.where(where)
			.deleteAndCount()
			.then((count) => ({ count }));

		this.eventBus.emit('alert-destinations:updated');
	}
}
