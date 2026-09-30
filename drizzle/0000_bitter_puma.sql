CREATE TABLE `arena` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`winner` text,
	`loser` text,
	`finished` integer NOT NULL
);
