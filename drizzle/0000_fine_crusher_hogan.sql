CREATE TABLE `alert_destinations` (
	`id` integer PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`zone_id` text NOT NULL,
	`county_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`auto_cleanup` integer DEFAULT true,
	`radar_image_url` text,
	`ping_on_severe` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `forecast_destinations` (
	`id` integer PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`channel_id` text NOT NULL,
	`auto_cleanup` integer DEFAULT true,
	`radar_image_url` text
);
--> statement-breakpoint
CREATE TABLE `sent_alerts` (
	`id` integer PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `volatile_messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
