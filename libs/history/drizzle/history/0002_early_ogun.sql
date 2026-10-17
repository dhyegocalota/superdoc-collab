CREATE TABLE `agent_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_name` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_actions_by_document` ON `agent_actions` (`document_name`,`created_at`);