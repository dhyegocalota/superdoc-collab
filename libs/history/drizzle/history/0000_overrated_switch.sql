CREATE TABLE `client_identities` (
	`document_name` text NOT NULL,
	`yjs_client_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`document_name`, `yjs_client_id`)
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`document_name` text NOT NULL,
	`sequence` integer NOT NULL,
	`state` blob NOT NULL,
	PRIMARY KEY(`document_name`, `sequence`)
);
--> statement-breakpoint
CREATE TABLE `updates` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_name` text NOT NULL,
	`connection_user_id` text NOT NULL,
	`yjs_client_ids` text NOT NULL,
	`server_time` integer NOT NULL,
	`update_bytes` blob NOT NULL
);
--> statement-breakpoint
CREATE INDEX `updates_by_document` ON `updates` (`document_name`,`sequence`);