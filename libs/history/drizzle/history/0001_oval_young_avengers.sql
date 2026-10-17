ALTER TABLE `client_identities` ADD `actor` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `updates` ADD `connection_actor` text DEFAULT 'human' NOT NULL;