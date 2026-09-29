ALTER TABLE `tasks` ADD `assignee_id` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_id`);