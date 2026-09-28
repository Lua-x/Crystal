import {
  addDays,
  type SmartView,
  type TagSummary,
  type Task,
  type ViewCounts,
} from '@crystal/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'

import type { Db } from '../db/client.js'
import {
  listMembers,
  lists,
  myDay,
  tasks,
  taskTags,
  type TaskRow,
  type UserRow,
} from '../db/schema.js'
import type { SearchService } from './search.js'
import type { TaskService } from './tasks.js'

const COMPLETED_LIMIT = 500
const SUGGESTION_LIMIT = 20

/**
 * Smart lists: computed from every list the user can see, in the user's time
 * zone. Only tasks in lists the user is a member of are ever returned.
 */
export class ViewService {
  constructor(
    private readonly db: Db,
    private readonly taskService: TaskService,
    private readonly search: SearchService,
  ) {}

  view(user: UserRow, view: SmartView): Task[] {
    const today = this.taskService.today(user)
    const open = isNull(tasks.completedAt)
    let rows: TaskRow[]

    switch (view) {
      case 'my-day':
        // Includes tasks completed today; the client shows them as "Completed".
        rows = this.tasksQuery(user)
          .innerJoin(myDay, this.myDayJoin(user, today))
          .where(this.visibleWhere())
          // Newest first, like new tasks at the top of a list.
          .orderBy(desc(myDay.addedAt), desc(tasks.id))
          .all()
          .map((row) => row.task)
        break
      case 'important':
        rows = this.visibleTasks(user, and(eq(tasks.important, true), open), [
          ...dueDateOrder(),
          asc(tasks.createdAt),
        ])
        break
      case 'planned':
        rows = this.visibleTasks(user, and(isNotNull(tasks.dueDate), open), [
          ...dueDateOrder(),
          asc(tasks.position),
        ])
        break
      case 'overdue':
        rows = this.visibleTasks(user, and(lt(tasks.dueDate, today), open), dueDateOrder())
        break
      case 'all':
        rows = this.visibleTasks(user, open, [asc(tasks.listId), asc(tasks.position)])
        break
      case 'completed':
        rows = this.visibleTasks(
          user,
          isNotNull(tasks.completedAt),
          [desc(tasks.completedAt)],
          COMPLETED_LIMIT,
        )
        break
    }
    return this.taskService.toDtos(user, rows)
  }

  counts(user: UserRow): ViewCounts {
    const today = this.taskService.today(user)
    const open = isNull(tasks.completedAt)
    const myDayCount =
      this.countQuery(user)
        .innerJoin(myDay, this.myDayJoin(user, today))
        .where(and(this.visibleWhere(), open))
        .get()?.value ?? 0

    return {
      'my-day': myDayCount,
      important: this.countVisible(user, and(eq(tasks.important, true), open)),
      planned: this.countVisible(user, and(isNotNull(tasks.dueDate), open)),
      overdue: this.countVisible(user, and(lt(tasks.dueDate, today), open)),
      all: this.countVisible(user, open),
      completed: this.countVisible(user, isNotNull(tasks.completedAt)),
    }
  }

  /**
   * Suggestions for My Day: open tasks that are overdue or due within two
   * days, then tasks added during the last week. Tasks already in My Day are
   * left out.
   */
  suggestions(user: UserRow): Task[] {
    const today = this.taskService.today(user)
    const inMyDay = this.db
      .select({ taskId: myDay.taskId })
      .from(myDay)
      .where(and(eq(myDay.userId, user.id), eq(myDay.date, today)))
    const candidate = and(isNull(tasks.completedAt), sql`${tasks.id} not in ${inMyDay}`)

    const due = this.visibleTasks(
      user,
      and(candidate, isNotNull(tasks.dueDate), lte(tasks.dueDate, addDays(today, 2))),
      dueDateOrder(),
      SUGGESTION_LIMIT,
    )
    const recentSince = new Date(Date.parse(`${addDays(today, -7)}T00:00:00Z`))
    const recent = this.visibleTasks(
      user,
      and(candidate, isNull(tasks.dueDate), gte(tasks.createdAt, recentSince)),
      [desc(tasks.createdAt)],
      SUGGESTION_LIMIT - due.length,
    )
    return this.taskService.toDtos(user, [...due, ...recent])
  }

  /** Tags on the user's visible tasks, alphabetically, with their number of open tasks. */
  tags(user: UserRow): TagSummary[] {
    return this.db
      .select({
        name: taskTags.tag,
        openCount: sql<number>`sum(case when ${tasks.completedAt} is null then 1 else 0 end)`,
      })
      .from(taskTags)
      .innerJoin(tasks, eq(tasks.id, taskTags.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(listMembers, this.memberJoin(user))
      .where(this.visibleWhere())
      .groupBy(taskTags.tag)
      .orderBy(asc(taskTags.tag))
      .all()
  }

  /** Visible tasks with `tag`: open ones by due date, then completed ones. */
  taggedTasks(user: UserRow, tag: string): Task[] {
    const tagged = this.db
      .select({ taskId: taskTags.taskId })
      .from(taskTags)
      .where(eq(taskTags.tag, tag))
    const rows = this.visibleTasks(user, inArray(tasks.id, tagged), [
      asc(sql`${tasks.completedAt} is not null`),
      ...dueDateOrder(),
      desc(tasks.completedAt),
      desc(tasks.createdAt),
    ])
    return this.taskService.toDtos(user, rows)
  }

  /** Full-text search in titles, notes, subtasks and tags of all visible tasks. */
  searchTasks(user: UserRow, query: string): Task[] {
    const ids = this.search.match(query)
    if (ids.length === 0) return []
    const rows = this.visibleTasks(user, inArray(tasks.id, ids), [])
    const rank = new Map(ids.map((id, index) => [id, index]))
    rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    return this.taskService.toDtos(user, rows)
  }

  /* ── Internals ──────────────────────────────────────────────── */

  /** Tasks joined with the user's memberships: the base of every view. */
  private tasksQuery(user: UserRow) {
    return this.db
      .select({ task: tasks })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(listMembers, this.memberJoin(user))
      .$dynamic()
  }

  private countQuery(user: UserRow) {
    return this.db
      .select({ value: count() })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(listMembers, this.memberJoin(user))
      .$dynamic()
  }

  private memberJoin(user: UserRow) {
    return and(eq(listMembers.listId, tasks.listId), eq(listMembers.userId, user.id))
  }

  private myDayJoin(user: UserRow, today: string) {
    return and(eq(myDay.taskId, tasks.id), eq(myDay.userId, user.id), eq(myDay.date, today))
  }

  private visibleWhere(): SQL | undefined {
    return and(isNull(tasks.deletedAt), isNull(lists.deletedAt))
  }

  private countVisible(user: UserRow, condition: SQL | undefined): number {
    return this.countQuery(user).where(and(this.visibleWhere(), condition)).get()?.value ?? 0
  }

  private visibleTasks(
    user: UserRow,
    condition: SQL | undefined,
    order: SQL[],
    limit?: number,
  ): TaskRow[] {
    if (limit !== undefined && limit <= 0) return []
    let query = this.tasksQuery(user)
      .where(and(this.visibleWhere(), condition))
      .orderBy(...order, asc(tasks.id))
    if (limit !== undefined) query = query.limit(limit)
    return query.all().map((row) => row.task)
  }
}

/** Earliest due date first; on the same day, timed tasks come before untimed ones. */
function dueDateOrder(): SQL[] {
  return [
    asc(sql`${tasks.dueDate} is null`),
    asc(tasks.dueDate),
    asc(sql`${tasks.dueTime} is null`),
    asc(tasks.dueTime),
  ]
}
