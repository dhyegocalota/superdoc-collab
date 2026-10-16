CREATE TABLE `document_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_topics_by_document` ON `document_topics` (`document_id`);--> statement-breakpoint
CREATE TABLE `topic_blocks` (
	`document_id` text NOT NULL,
	`block_id` text NOT NULL,
	`topic_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `block_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `document_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_sets` (
	`document_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`failure` text,
	`computed_at_sequence` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_summaries` (
	`topic_id` text PRIMARY KEY NOT NULL,
	`sentence` text NOT NULL,
	`computed_at_sequence` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `document_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
