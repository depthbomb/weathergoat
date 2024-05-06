import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const forecastDestinations = sqliteTable('forecast_destinations', {
	id: integer('id').primaryKey(),
	snowflake: text('snowflake').notNull(),
	latitude: text('latitude').notNull(),
	longitude: text('longitude').notNull(),
	channelId: text('channel_id').notNull(),
	autoCleanup: integer('auto_cleanup', { mode: 'boolean' }).default(true),
	radarImageUrl: text('radar_image_url'),
});
