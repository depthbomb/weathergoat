import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const volatileMessages = sqliteTable('volatile_messages', {
	id: integer('id').primaryKey(),
	channelId: text('channel_id').notNull(),
	messageId: text('message_id').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});
