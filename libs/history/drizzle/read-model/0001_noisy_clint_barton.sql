CREATE TABLE `version_marks` (
	`document_name` text NOT NULL,
	`sequence` integer NOT NULL,
	`server_time` integer NOT NULL,
	`minute_start` integer NOT NULL,
	`is_bootstrap` integer NOT NULL,
	`snapshot` blob NOT NULL,
	PRIMARY KEY(`document_name`, `sequence`)
);
--> statement-breakpoint
CREATE INDEX `version_marks_by_minute` ON `version_marks` (`document_name`,`minute_start`);