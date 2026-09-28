-- Adds tags to the full-text index (see migration 0002 and services/search.ts).
-- FTS5 tables cannot gain columns, so the index is rebuilt from the tasks.
DROP TABLE `task_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `task_search` USING fts5(
	`task_id` UNINDEXED,
	`title`,
	`notes`,
	`subtasks`,
	`tags`,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);
--> statement-breakpoint
INSERT INTO `task_search` (`task_id`, `title`, `notes`, `subtasks`, `tags`)
SELECT
	`tasks`.`id`,
	`tasks`.`title`,
	`tasks`.`notes`,
	coalesce((SELECT group_concat(`subtasks`.`title`, char(10)) FROM `subtasks` WHERE `subtasks`.`task_id` = `tasks`.`id`), ''),
	coalesce((SELECT group_concat(`task_tags`.`tag`, ' ') FROM `task_tags` WHERE `task_tags`.`task_id` = `tasks`.`id`), '')
FROM `tasks`
WHERE `tasks`.`deleted_at` IS NULL;
