import {
  todayIn,
  uuidv7,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type Priority,
  type Subtask,
  type Task,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '@crystal/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import {
  myDay,
  subtasks,
  tasks,
  type SubtaskRow,
  type TaskRow,
  type UserRow,
} from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'
import {
  freshPositions,
  positionAfter,
  positionAtEnd,
  positionAtStart,
  type Ordered,
} from '../lib/ordering.js'
import type { ListService } from './lists.js'
import type { SearchService } from './search.js'

/** Fields that change the task for everyone (as opposed to the personal My Day). */
const SHARED_FIELDS = [
  'title',
  'notes',
  'dueDate',
  'dueTime',
  'important',
  'priority',
  'completed',
  'placement',
] as const

export class TaskService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly search: SearchService,
    private readonly now: () => Date,
  ) {}

  /** Today in the user's time zone – the day "My Day" refers to. */
  today(user: UserRow): string {
    return todayIn(user.timezone, this.now())
  }

  /** Converts rows to API objects, loading subtasks and My Day flags in bulk. */
  toDtos(user: UserRow, rows: TaskRow[], executor: Executor = this.db): Task[] {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const subtaskRows = executor
      .select()
      .from(subtasks)
      .where(inArray(subtasks.taskId, ids))
      .orderBy(asc(subtasks.position), asc(subtasks.id))
      .all()
    const byTask = new Map<string, Subtask[]>()
    for (const row of subtaskRows) {
      const list = byTask.get(row.taskId) ?? []
      list.push(toSubtask(row))
      byTask.set(row.taskId, list)
    }
    const inMyDay = new Set(
      executor
        .select({ taskId: myDay.taskId })
        .from(myDay)
        .where(
          and(
            eq(myDay.userId, user.id),
            eq(myDay.date, this.today(user)),
            inArray(myDay.taskId, ids),
          ),
        )
        .all()
        .map((row) => row.taskId),
    )
    return rows.map((row) => ({
      id: row.id,
      listId: row.listId,
      title: row.title,
      notes: row.notes,
      dueDate: row.dueDate,
      dueTime: row.dueTime,
      important: row.important,
      priority: row.priority as Priority,
      position: row.position,
      completedAt: row.completedAt?.toISOString() ?? null,
      inMyDay: inMyDay.has(row.id),
      subtasks: byTask.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
  }

  tasksOfList(user: UserRow, listId: string): Task[] {
    this.lists.requireRole(user.id, listId, 'viewer')
    const rows = this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.listId, listId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .all()
    return this.toDtos(user, rows)
  }

  get(user: UserRow, taskId: string): Task {
    const task = this.findTask(taskId)
    this.lists.requireRole(user.id, task.listId, 'viewer')
    return this.toDtos(user, [task])[0]!
  }

  create(user: UserRow, input: CreateTaskInput): Task {
    const listId = input.listId ?? this.lists.ensureDefaultList(user)
    const id = input.id ?? uuidv7(this.now().getTime())

    this.db.transaction((tx) => {
      this.lists.requireRole(user.id, listId, 'editor', tx)
      if (tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).get()) {
        throw new AppError(400, 'validation_failed', 'This ID is already in use.')
      }
      const now = this.now()
      // New tasks go to the top of the list.
      tx.insert(tasks)
        .values({
          id,
          listId,
          title: input.title,
          notes: input.notes ?? '',
          dueDate: input.dueDate ?? null,
          dueTime: input.dueDate ? (input.dueTime ?? null) : null,
          important: input.important ?? false,
          priority: input.priority ?? 0,
          position: positionAtStart(this.orderedTasks(listId, tx)),
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      if (input.myDay) this.setMyDay(user, id, true, tx)
      this.search.reindex(id, tx)
    })
    return this.get(user, id)
  }

  update(user: UserRow, taskId: string, input: UpdateTaskInput): Task {
    this.db.transaction((tx) => {
      const task = this.findTask(taskId, tx)
      const changesTask = SHARED_FIELDS.some((field) => input[field] !== undefined)
      // Adding a task to one's own My Day only requires read access.
      this.lists.requireRole(user.id, task.listId, changesTask ? 'editor' : 'viewer', tx)

      if (changesTask) {
        const changes: Partial<TaskRow> = { updatedAt: this.now() }
        if (input.title !== undefined) changes.title = input.title
        if (input.notes !== undefined) changes.notes = input.notes
        if (input.important !== undefined) changes.important = input.important
        if (input.priority !== undefined) changes.priority = input.priority

        if (input.dueDate !== undefined || input.dueTime !== undefined) {
          const dueDate = input.dueDate !== undefined ? input.dueDate : task.dueDate
          let dueTime = input.dueTime !== undefined ? input.dueTime : task.dueTime
          if (dueDate === null) {
            // A time on its own is meaningless; removing the date also removes the time.
            if (input.dueTime) {
              throw new AppError(400, 'validation_failed', undefined, [
                { path: 'dueTime', code: 'custom', message: 'validation.time_requires_date' },
              ])
            }
            dueTime = null
          }
          changes.dueDate = dueDate
          changes.dueTime = dueTime
        }

        if (input.completed === true && !task.completedAt) {
          changes.completedAt = this.now()
          changes.completedBy = user.id
        } else if (input.completed === false) {
          changes.completedAt = null
          changes.completedBy = null
        }

        if (input.placement) {
          const targetListId = input.placement.listId ?? task.listId
          if (targetListId !== task.listId) {
            this.lists.requireRole(user.id, targetListId, 'editor', tx)
            changes.listId = targetListId
          }
          const others = this.orderedTasks(targetListId, tx).filter((item) => item.id !== taskId)
          changes.position = positionAfter(others, input.placement.after, (stale) =>
            this.rebalanceTasks(stale, tx),
          )
        }

        tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).run()
        if (input.title !== undefined || input.notes !== undefined) this.search.reindex(taskId, tx)
      }

      if (input.myDay !== undefined) this.setMyDay(user, taskId, input.myDay, tx)
    })
    return this.get(user, taskId)
  }

  /** Moves the task to the trash; it can be restored until the cleanup job runs. */
  delete(user: UserRow, taskId: string): void {
    this.db.transaction((tx) => {
      const task = this.findTask(taskId, tx)
      this.lists.requireRole(user.id, task.listId, 'editor', tx)
      tx.update(tasks).set({ deletedAt: this.now() }).where(eq(tasks.id, taskId)).run()
      this.search.remove(taskId, tx)
    })
  }

  restore(user: UserRow, taskId: string): Task {
    this.db.transaction((tx) => {
      const task = tx.select().from(tasks).where(eq(tasks.id, taskId)).get()
      if (!task) throw new AppError(404, 'not_found')
      this.lists.requireRole(user.id, task.listId, 'editor', tx)
      tx.update(tasks)
        .set({ deletedAt: null, updatedAt: this.now() })
        .where(eq(tasks.id, taskId))
        .run()
      this.search.reindex(taskId, tx)
    })
    return this.get(user, taskId)
  }

  /* ── Subtasks ─────────────────────────────────────────────────── */

  addSubtask(user: UserRow, taskId: string, input: CreateSubtaskInput): Task {
    this.db.transaction((tx) => {
      const task = this.findTask(taskId, tx)
      this.lists.requireRole(user.id, task.listId, 'editor', tx)
      const id = input.id ?? uuidv7(this.now().getTime())
      if (tx.select({ id: subtasks.id }).from(subtasks).where(eq(subtasks.id, id)).get()) {
        throw new AppError(400, 'validation_failed', 'This ID is already in use.')
      }
      const now = this.now()
      tx.insert(subtasks)
        .values({
          id,
          taskId,
          title: input.title,
          position: positionAtEnd(this.orderedSubtasks(taskId, tx)),
          createdAt: now,
          updatedAt: now,
        })
        .run()
      this.touch(taskId, tx)
      this.search.reindex(taskId, tx)
    })
    return this.get(user, taskId)
  }

  updateSubtask(user: UserRow, subtaskId: string, input: UpdateSubtaskInput): Task {
    const taskId = this.db.transaction((tx) => {
      const subtask = this.findSubtask(user, subtaskId, tx)
      const changes: Partial<SubtaskRow> = { updatedAt: this.now() }
      if (input.title !== undefined) changes.title = input.title
      if (input.completed !== undefined) changes.completedAt = input.completed ? this.now() : null
      if (input.placement) {
        const others = this.orderedSubtasks(subtask.taskId, tx).filter(
          (item) => item.id !== subtaskId,
        )
        changes.position = positionAfter(others, input.placement.after, (stale) =>
          this.rebalanceSubtasks(stale, tx),
        )
      }
      tx.update(subtasks).set(changes).where(eq(subtasks.id, subtaskId)).run()
      this.touch(subtask.taskId, tx)
      if (input.title !== undefined) this.search.reindex(subtask.taskId, tx)
      return subtask.taskId
    })
    return this.get(user, taskId)
  }

  deleteSubtask(user: UserRow, subtaskId: string): Task {
    const taskId = this.db.transaction((tx) => {
      const subtask = this.findSubtask(user, subtaskId, tx)
      tx.delete(subtasks).where(eq(subtasks.id, subtaskId)).run()
      this.touch(subtask.taskId, tx)
      this.search.reindex(subtask.taskId, tx)
      return subtask.taskId
    })
    return this.get(user, taskId)
  }

  /* ── Internals ──────────────────────────────────────────────── */

  private findTask(taskId: string, executor: Executor = this.db): TaskRow {
    const task = executor
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .get()
    if (!task) throw new AppError(404, 'not_found')
    return task
  }

  private findSubtask(user: UserRow, subtaskId: string, executor: Executor): SubtaskRow {
    const subtask = executor.select().from(subtasks).where(eq(subtasks.id, subtaskId)).get()
    if (!subtask) throw new AppError(404, 'not_found')
    const task = this.findTask(subtask.taskId, executor)
    this.lists.requireRole(user.id, task.listId, 'editor', executor)
    return subtask
  }

  private setMyDay(user: UserRow, taskId: string, add: boolean, tx: Executor): void {
    if (!add) {
      tx.delete(myDay)
        .where(and(eq(myDay.userId, user.id), eq(myDay.taskId, taskId)))
        .run()
      return
    }
    tx.insert(myDay)
      .values({ userId: user.id, taskId, date: this.today(user), addedAt: this.now() })
      .onConflictDoUpdate({
        target: [myDay.userId, myDay.taskId],
        set: { date: this.today(user), addedAt: this.now() },
      })
      .run()
  }

  private touch(taskId: string, tx: Executor): void {
    tx.update(tasks).set({ updatedAt: this.now() }).where(eq(tasks.id, taskId)).run()
  }

  private orderedTasks(listId: string, executor: Executor): Ordered[] {
    return executor
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.listId, listId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .all()
  }

  private orderedSubtasks(taskId: string, executor: Executor): Ordered[] {
    return executor
      .select({ id: subtasks.id, position: subtasks.position })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.position), asc(subtasks.id))
      .all()
  }

  private rebalanceTasks(items: Ordered[], tx: Executor): Ordered[] {
    const fresh = freshPositions(items)
    for (const item of fresh) {
      tx.update(tasks).set({ position: item.position }).where(eq(tasks.id, item.id)).run()
    }
    return fresh
  }

  private rebalanceSubtasks(items: Ordered[], tx: Executor): Ordered[] {
    const fresh = freshPositions(items)
    for (const item of fresh) {
      tx.update(subtasks).set({ position: item.position }).where(eq(subtasks.id, item.id)).run()
    }
    return fresh
  }
}

function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    completedAt: row.completedAt?.toISOString() ?? null,
    position: row.position,
  }
}
