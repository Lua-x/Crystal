-- Full-text index over task titles, notes and subtask titles. Maintained by the
-- application (see services/search.ts). `remove_diacritics 2` lets "mull" find
-- "Müll"; the prefix index speeds up search-as-you-type.
CREATE VIRTUAL TABLE `task_search` USING fts5(
	`task_id` UNINDEXED,
	`title`,
	`notes`,
	`subtasks`,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);
