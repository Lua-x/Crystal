CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `images_list_idx` ON `images` (`list_id`);--> statement-breakpoint
CREATE TABLE `instance` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `lists` ADD `cover_image_id` text;--> statement-breakpoint
ALTER TABLE `lists` ADD `deadline` text;--> statement-breakpoint
-- Instances set up before modes existed are everyday instances.
INSERT INTO `instance` (`id`, `mode`, `created_at`)
SELECT 1, 'standard', MIN(`created_at`) FROM `users` HAVING COUNT(*) > 0;
