import { eq, sql } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { subtasks, tasks, taskTags } from '../db/schema.js'
import type { Executor } from '../db/types.js'

/**
 * Maintains and queries the FTS5 index `task_search` (see migrations 0002 and
 * 0004). Every write path that changes a task's title, notes, subtasks or tags
 * calls `reindex` inside its transaction.
 */
export class SearchService {
  constructor(private readonly db: Db) {}

  reindex(taskId: string, executor: Executor = this.db): void {
    executor.run(sql`delete from task_search where task_id = ${taskId}`)
    const task = executor
      .select({ title: tasks.title, notes: tasks.notes, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get()
    if (!task || task.deletedAt) return
    const subtaskTitles = executor
      .select({ title: subtasks.title })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .all()
      .map((row) => row.title)
      .join('\n')
    const tags = executor
      .select({ tag: taskTags.tag })
      .from(taskTags)
      .where(eq(taskTags.taskId, taskId))
      .all()
      .map((row) => row.tag)
      .join(' ')
    executor.run(
      sql`insert into task_search (task_id, title, notes, subtasks, tags)
          values (${taskId}, ${task.title}, ${task.notes}, ${subtaskTitles}, ${tags})`,
    )
  }

  remove(taskId: string, executor: Executor = this.db): void {
    executor.run(sql`delete from task_search where task_id = ${taskId}`)
  }

  /** Removes index entries whose task no longer exists. */
  removeOrphans(executor: Executor = this.db): void {
    executor.run(sql`delete from task_search where task_id not in (select id from tasks)`)
  }

  /**
   * IDs of tasks matching every word of `query` as a prefix, best match first.
   * Words are quoted, so FTS5 syntax in the input is treated as plain text.
   */
  match(query: string, limit = 200): string[] {
    const terms = query
      .normalize('NFKC')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replaceAll('"', '""')}"*`)
    if (terms.length === 0) return []
    return this.db
      .all<{
        task_id: string
      }>(
        sql`select task_id from task_search where task_search match ${terms.join(' ')} order by rank limit ${limit}`,
      )
      .map((row) => row.task_id)
  }
}
