ALTER TABLE sent_alerts ADD `guild_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE sent_alerts ADD `channel_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `sent_alerts_alert_id_unique` ON `sent_alerts` (`alert_id`);