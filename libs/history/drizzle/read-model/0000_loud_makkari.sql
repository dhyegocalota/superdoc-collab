CREATE TABLE `edit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_name` text NOT NULL,
	`event_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`server_time` integer NOT NULL,
	`yjs_client_ids` text,
	`connection_user_id` text,
	`author_name` text,
	`block_id` text NOT NULL,
	`kind` text NOT NULL,
	`inserted` text NOT NULL,
	`deleted` text NOT NULL,
	`imported` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `edit_events_by_document` ON `edit_events` (`document_name`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `edit_events_by_key` ON `edit_events` (`document_name`,`event_key`);--> statement-breakpoint
CREATE TABLE `projection_cursor` (
	`document_name` text PRIMARY KEY NOT NULL,
	`last_sequence` integer NOT NULL
);
