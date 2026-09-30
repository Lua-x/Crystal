import {
  addDays,
  daysBetween,
  firstOccurrence,
  instantToZonedTime,
  nextOccurrence,
  todayIn,
  uuidv7,
  zonedTimeToInstant,
  type CreateSubtaskInput,
  type CreateTaskData,
  type Priority,
  type Recurrence,
  type Subtask,
  type Task,
  type UpdateSubtaskInput,
  type UpdateTaskData,
} from '@crystal/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import {
  achievements,
  mapPins,
  maps,
  myDay,
  subtasks,
  tasks,
  taskTags,
  users,
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
import type { EventHub } from './events.js'
import type { ListService } from './lists.js'
import type { AttachmentService } from './attachments.js'
import type { NotificationService } from './notifications.js'
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
  'recurrence',
  'tags',
  'assigneeId',
  'remindAt',
  'pin',
] as const

export class TaskService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly search: SearchService,
    private readonly events: EventHub,
    private readonly notifications: NotificationService,
    private readonly attachments: AttachmentService,
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
    const tagsByTask = new Map<string, string[]>()
    for (const row of executor
      .select()
      .from(taskTags)
      .where(inArray(taskTags.taskId, ids))
      .orderBy(asc(taskTags.tag))
      .all()) {
      tagsByTask.set(row.taskId, [...(tagsByTask.get(row.taskId) ?? []), row.tag])
    }
    const assigneeIds = [
      ...new Set(rows.flatMap((row) => (row.assigneeId ? [row.assigneeId] : []))),
    ]
    const assignees = new Map(
      assigneeIds.length > 0
        ? executor
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, assigneeIds))
            .all()
            .map((person) => [person.id, person])
        : [],
    )
    const files = this.attachments.forTasks(ids, executor)
    const pinsByTask = new Map(
      executor
        .select()
        .from(mapPins)
        .where(inArray(mapPins.taskId, ids))
        .all()
        .map((row) => [row.taskId, { mapId: row.mapId, x: row.x, y: row.y }]),
    )
    const achievementsByTask = new Map(
      executor
        .select()
        .from(achievements)
        .where(inArray(achievements.taskId, ids))
        .all()
        .map((row) => [
          row.taskId,
          { iconImageId: row.iconImageId, percent: row.percent, hidden: row.hidden },
        ]),
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
      recurrence: row.recurrence ?? null,
      tags: tagsByTask.get(row.id) ?? [],
      assignee: (row.assigneeId && assignees.get(row.assigneeId)) || null,
      remindAt: row.remindAt?.toISOString() ?? null,
      subtasks: byTask.get(row.id) ?? [],
      attachments: files.get(row.id) ?? [],
      achievement: achievementsByTask.get(row.id) ?? null,
      pin: pinsByTask.get(row.id) ?? null,
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

  create(user: UserRow, input: CreateTaskData): Task {
    const listId = input.listId ?? this.lists.ensureDefaultList(user)
    const id = input.id ?? uuidv7(this.now().getTime())
    const recurrence = input.recurrence ?? null
    // A repeating task always has a due date.
    const dueDate =
      input.dueDate ?? (recurrence ? firstOccurrence(recurrence, this.today(user)) : null)

    this.db.transaction((tx) => {
      this.lists.requireRole(user.id, listId, 'editor', tx)
      if (tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).get()) {
        throw new AppError(400, 'validation_failed', 'This ID is already in use.')
      }
      if (input.assigneeId) this.requireAssignable(input.assigneeId, listId, tx)
      const now = this.now()
      // New tasks go to the top of the list.
      tx.insert(tasks)
        .values({
          id,
          listId,
          title: input.title,
          notes: input.notes ?? '',
          dueDate,
          dueTime: dueDate ? (input.dueTime ?? null) : null,
          important: input.important ?? false,
          priority: input.priority ?? 0,
          position: positionAtStart(this.orderedTasks(listId, tx)),
          recurrence,
          assigneeId: input.assigneeId ?? null,
          remindAt: input.remindAt ? new Date(input.remindAt) : null,
          reminderBy: input.remindAt ? user.id : null,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      if (input.tags) this.setTags(id, input.tags, tx)
      if (input.myDay) this.setMyDay(user, id, true, tx)
      this.search.reindex(id, tx)
    })
    this.events.listsChanged([listId])
    if (input.assigneeId && input.assigneeId !== user.id) {
      this.notifications.taskAssigned(user, id, input.assigneeId)
    }
    return this.get(user, id)
  }

  update(user: UserRow, taskId: string, input: UpdateTaskData): Task {
    const touched = this.db.transaction((tx) => {
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

        // Due date, time and repetition depend on each other.
        if (
          input.dueDate !== undefined ||
          input.dueTime !== undefined ||
          input.recurrence !== undefined
        ) {
          let recurrence = input.recurrence !== undefined ? input.recurrence : task.recurrence
          // Removing the date ends the repetition, unless a new rule comes with it.
          if (input.dueDate === null && input.recurrence === undefined) recurrence = null
          let dueDate = input.dueDate !== undefined ? input.dueDate : task.dueDate
          if (recurrence && dueDate === null)
            dueDate = firstOccurrence(recurrence, this.today(user))
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
          changes.recurrence = recurrence
          // A new date or rule starts the series anew.
          if (input.dueDate !== undefined || input.recurrence !== undefined) {
            changes.recurrenceAnchor = null
          }
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

        const listId = changes.listId ?? task.listId
        if (input.assigneeId !== undefined) {
          if (input.assigneeId) this.requireAssignable(input.assigneeId, listId, tx)
          changes.assigneeId = input.assigneeId
        } else if (
          changes.listId &&
          task.assigneeId &&
          !this.isAssignable(task.assigneeId, changes.listId, tx)
        ) {
          // Someone who cannot work on the new list cannot keep the task.
          changes.assigneeId = null
        }

        if (input.remindAt !== undefined) {
          // A new reminder time rings again, for whoever set it.
          changes.remindAt = input.remindAt ? new Date(input.remindAt) : null
          changes.remindedAt = null
          changes.reminderBy = input.remindAt ? user.id : null
        }

        tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).run()
        if (input.pin !== undefined) {
          this.setPin(taskId, listId, input.pin, tx)
        } else if (changes.listId) {
          // Maps belong to their game; in another one, the goal has no place.
          this.setPin(taskId, listId, null, tx)
        }
        if (input.tags !== undefined) this.setTags(taskId, input.tags, tx)
        // After the other changes, so the next occurrence inherits them.
        if (input.completed === true && !task.completedAt) this.complete(user, taskId, tx)
        else if (input.completed === false && task.completedAt) this.reopen(taskId, tx)
        if (input.title !== undefined || input.notes !== undefined || input.tags !== undefined) {
          this.search.reindex(taskId, tx)
        }
      }

      if (input.myDay !== undefined) this.setMyDay(user, taskId, input.myDay, tx)
      return {
        shared: changesTask,
        lists: [task.listId, input.placement?.listId ?? task.listId],
        newAssignee:
          input.assigneeId && input.assigneeId !== task.assigneeId ? input.assigneeId : undefined,
      }
    })
    // My Day is personal; everything else concerns everyone on the list(s).
    if (touched.shared) this.events.listsChanged(touched.lists)
    else this.events.personalChange(user.id)
    if (touched.newAssignee && touched.newAssignee !== user.id) {
      this.notifications.taskAssigned(user, taskId, touched.newAssignee)
    }
    return this.get(user, taskId)
  }

  /** Puts a task on a map of its list, or takes it off with `null`. */
  private setPin(
    taskId: string,
    listId: string,
    pin: { mapId: string; x: number; y: number } | null,
    tx: Executor,
  ): void {
    if (!pin) {
      tx.delete(mapPins).where(eq(mapPins.taskId, taskId)).run()
      return
    }
    const map = tx.select({ listId: maps.listId }).from(maps).where(eq(maps.id, pin.mapId)).get()
    if (map?.listId !== listId) {
      throw new AppError(400, 'validation_failed', 'The map belongs to another list.', [
        { path: 'pin.mapId', code: 'custom', message: 'The map belongs to another list.' },
      ])
    }
    tx.insert(mapPins)
      .values({ taskId, ...pin })
      .onConflictDoUpdate({ target: mapPins.taskId, set: { mapId: pin.mapId, x: pin.x, y: pin.y } })
      .run()
  }

  /** Moves the task to the trash; it can be restored until the cleanup job runs. */
  delete(user: UserRow, taskId: string): void {
    const listId = this.db.transaction((tx) => {
      const task = this.findTask(taskId, tx)
      this.lists.requireRole(user.id, task.listId, 'editor', tx)
      tx.update(tasks).set({ deletedAt: this.now() }).where(eq(tasks.id, taskId)).run()
      this.search.remove(taskId, tx)
      return task.listId
    })
    this.events.listsChanged([listId])
  }

  restore(user: UserRow, taskId: string): Task {
    const listId = this.db.transaction((tx) => {
      const task = tx.select().from(tasks).where(eq(tasks.id, taskId)).get()
      if (!task) throw new AppError(404, 'not_found')
      this.lists.requireRole(user.id, task.listId, 'editor', tx)
      tx.update(tasks)
        .set({ deletedAt: null, updatedAt: this.now() })
        .where(eq(tasks.id, taskId))
        .run()
      this.search.reindex(taskId, tx)
      return task.listId
    })
    this.events.listsChanged([listId])
    return this.get(user, taskId)
  }

  /* ── Subtasks ─────────────────────────────────────────────────── */

  addSubtask(user: UserRow, taskId: string, input: CreateSubtaskInput): Task {
    const listId = this.db.transaction((tx) => {
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
      return task.listId
    })
    this.events.listsChanged([listId])
    return this.get(user, taskId)
  }

  updateSubtask(user: UserRow, subtaskId: string, input: UpdateSubtaskInput): Task {
    const { taskId, listId } = this.db.transaction((tx) => {
      const { subtask, listId } = this.findSubtask(user, subtaskId, tx)
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
      return { taskId: subtask.taskId, listId }
    })
    this.events.listsChanged([listId])
    return this.get(user, taskId)
  }

  deleteSubtask(user: UserRow, subtaskId: string): Task {
    const { taskId, listId } = this.db.transaction((tx) => {
      const { subtask, listId } = this.findSubtask(user, subtaskId, tx)
      tx.delete(subtasks).where(eq(subtasks.id, subtaskId)).run()
      this.touch(subtask.taskId, tx)
      this.search.reindex(subtask.taskId, tx)
      return { taskId: subtask.taskId, listId }
    })
    this.events.listsChanged([listId])
    return this.get(user, taskId)
  }

  /* ── Internals ──────────────────────────────────────────────── */

  /**
   * Completes a task. A repeating task hands its rule on to a new task for the
   * next occurrence, so each series has exactly one open task.
   */
  private complete(user: UserRow, taskId: string, tx: Executor): void {
    const task = this.findTask(taskId, tx)
    const changes: Partial<TaskRow> = { completedAt: this.now(), completedBy: user.id }
    if (task.recurrence) {
      changes.nextTaskId = this.createNextOccurrence(user, task, task.recurrence, tx)
      changes.recurrence = null
      changes.recurrenceAnchor = null
    }
    tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).run()
  }

  /**
   * Reopens a task. If completing it created a next occurrence that nobody has
   * touched since, that one is removed again and the rule returns – so undoing
   * an accidental tick leaves no duplicate behind.
   */
  private reopen(taskId: string, tx: Executor): void {
    const task = this.findTask(taskId, tx)
    const changes: Partial<TaskRow> = { completedAt: null, completedBy: null, nextTaskId: null }
    const next = task.nextTaskId
      ? tx.select().from(tasks).where(eq(tasks.id, task.nextTaskId)).get()
      : undefined
    if (
      next &&
      !next.deletedAt &&
      !next.completedAt &&
      next.updatedAt.getTime() === next.createdAt.getTime()
    ) {
      changes.recurrence = next.recurrence
      changes.recurrenceAnchor = next.recurrenceAnchor
      tx.delete(tasks).where(eq(tasks.id, next.id)).run()
      this.search.remove(next.id, tx)
    }
    tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).run()
  }

  /** Creates the task for the next occurrence right after `task`; returns its id. */
  private createNextOccurrence(
    user: UserRow,
    task: TaskRow,
    rule: Recurrence,
    tx: Executor,
  ): string {
    const id = uuidv7(this.now().getTime())
    const now = this.now()
    const dueDate = nextOccurrence(
      rule,
      { dueDate: task.dueDate, anchor: task.recurrenceAnchor },
      this.today(user),
    )
    tx.insert(tasks)
      .values({
        id,
        listId: task.listId,
        title: task.title,
        notes: task.notes,
        dueDate,
        dueTime: task.dueTime,
        important: task.important,
        priority: task.priority,
        position: positionAfter(this.orderedTasks(task.listId, tx), task.id, (stale) =>
          this.rebalanceTasks(stale, tx),
        ),
        recurrence: rule,
        recurrenceAnchor: rule.from === 'due' ? (task.recurrenceAnchor ?? task.dueDate) : null,
        assigneeId: task.assigneeId,
        remindAt: this.shiftReminder(user, task, dueDate, tx),
        reminderBy: task.remindAt ? task.reminderBy : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    // Steps start over; tags carry over.
    for (const subtask of tx
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, task.id))
      .orderBy(asc(subtasks.position), asc(subtasks.id))
      .all()) {
      tx.insert(subtasks)
        .values({
          id: uuidv7(now.getTime()),
          taskId: id,
          title: subtask.title,
          position: subtask.position,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
    const tags = tx
      .select({ tag: taskTags.tag })
      .from(taskTags)
      .where(eq(taskTags.taskId, task.id))
      .all()
      .map((row) => row.tag)
    this.setTags(id, tags, tx)
    this.search.reindex(id, tx)
    return id
  }

  /**
   * The reminder of the next occurrence: as many days later as the due date,
   * at the same local time for the person who gets it (also across DST).
   */
  private shiftReminder(
    user: UserRow,
    task: TaskRow,
    nextDueDate: string,
    tx: Executor,
  ): Date | null {
    if (!task.remindAt || !task.dueDate) return null
    const recipientId = task.assigneeId ?? task.reminderBy
    const recipient = recipientId
      ? tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, recipientId)).get()
      : undefined
    const timezone = recipient?.timezone ?? user.timezone
    const local = instantToZonedTime(task.remindAt, timezone)
    const date = addDays(local.date, daysBetween(task.dueDate, nextDueDate))
    return zonedTimeToInstant(date, local.time, timezone)
  }

  private setTags(taskId: string, tags: readonly string[], tx: Executor): void {
    tx.delete(taskTags).where(eq(taskTags.taskId, taskId)).run()
    if (tags.length > 0) {
      tx.insert(taskTags)
        .values(tags.map((tag) => ({ taskId, tag })))
        .run()
    }
  }

  private findTask(taskId: string, executor: Executor = this.db): TaskRow {
    const task = executor
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .get()
    if (!task) throw new AppError(404, 'not_found')
    return task
  }

  private findSubtask(
    user: UserRow,
    subtaskId: string,
    executor: Executor,
  ): { subtask: SubtaskRow; listId: string } {
    const subtask = executor.select().from(subtasks).where(eq(subtasks.id, subtaskId)).get()
    if (!subtask) throw new AppError(404, 'not_found')
    const task = this.findTask(subtask.taskId, executor)
    this.lists.requireRole(user.id, task.listId, 'editor', executor)
    return { subtask, listId: task.listId }
  }

  /** Tasks can be assigned to people who can edit the list. */
  private isAssignable(userId: string, listId: string, executor: Executor): boolean {
    const role = this.lists.roleOf(userId, listId, executor)
    return role === 'owner' || role === 'editor'
  }

  private requireAssignable(userId: string, listId: string, executor: Executor): void {
    if (!this.isAssignable(userId, listId, executor)) throw new AppError(400, 'not_a_member')
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
