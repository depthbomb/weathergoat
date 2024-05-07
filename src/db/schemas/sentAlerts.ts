import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const sentAlerts = sqliteTable('sent_alerts', {
	id: integer('id').primaryKey(),
	alertId: text('alert_id').unique().notNull(),
	guildId: text('guild_id').notNull(),
	channelId: text('channel_id').notNull(),
	messageId: text('message_id').notNull(),
	json: text('json'),
});
