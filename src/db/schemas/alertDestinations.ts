import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const alertDestinations = sqliteTable('alert_destinations', {
	id: integer('id').primaryKey(),
	snowflake: text('snowflake').notNull(),
	latitude: text('latitude').notNull(),
	longitude: text('longitude').notNull(),
	zoneId: text('zone_id').notNull(),
	countyId: text('county_id').notNull(),
	channelId: text('channel_id').notNull(),
	autoCleanup: integer('auto_cleanup', { mode: 'boolean' }).default(true),
	radarImageUrl: text('radar_image_url'),
	pingOnSevere: integer('ping_on_severe', { mode: 'boolean' }).default(false)
});
