CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_tags_tag_idx` ON `task_tags` (`tag`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_anchor` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `next_task_id` text REFERENCES tasks(id) ON DELETE set null;