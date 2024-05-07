ALTER TABLE sent_alerts ADD `message_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE volatile_messages ADD `guild_id` text NOT NULL;
