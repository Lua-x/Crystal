CREATE TABLE `achievements` (
	`list_id` text NOT NULL,
	`api_name` text NOT NULL,
	`task_id` text,
	`icon_image_id` text,
	`percent` real,
	`hidden` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`list_id`, `api_name`),
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`icon_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievements_task_idx` ON `achievements` (`task_id`);--> statement-breakpoint
ALTER TABLE `lists` ADD `steam_app_id` integer;--> statement-breakpoint
ALTER TABLE `lists` ADD `steam_synced_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `steam_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `steam_name` text;