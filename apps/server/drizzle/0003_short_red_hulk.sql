CREATE TABLE `selection_summaries` (
	`document_id` text NOT NULL,
	`filter_key` text NOT NULL,
	`sentence` text,
	`authors` text NOT NULL,
	`failure` text,
	`computed_at_sequence` integer NOT NULL,
	`topics_updated_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`document_id`, `filter_key`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
