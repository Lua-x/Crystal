import {
  firstOccurrence,
  GROUP_NAME_MAX_LENGTH,
  keysBetween,
  LIST_ICON_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  recurrenceSchema,
  SUBTASK_TITLE_MAX_LENGTH,
  TAGS_PER_TASK_MAX,
  tagSchema,
  TASK_NOTES_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  todayIn,
  uuidv7,
  type CrystalExport,
  type ExportList,
  type ImportRequest,
  type ImportResult,
  type Priority,
} from '@crystal/shared'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import {
  listGroups,
  listMembers,
  lists,
  subtasks,
  tasks,
  taskTags,
  type UserRow,
} from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'
import { parseCrystalExport } from '../import/crystal.js'
import { parseOutlookCsv } from '../import/outlook.js'
import { parseTodoistCsv } from '../import/todoist.js'
import { ImportError, type ImportedList, type ImportedTask } from '../import/types.js'
import type { EventHub } from './events.js'
import type { ListService } from './lists.js'
import type { SearchService } from './search.js'

const MAX_IMPORT_LISTS = 200
const MAX_IMPORT_TASKS = 20_000
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Exports everything a person can see, and imports from Crystal, Todoist and Outlook. */
export class TransferService {
  constructor(
    private readonly db: Db,
    private readonly lists: ListService,
    private readonly search: SearchService,
    private readonly events: EventHub,
    private readonly now: () => Date,
  ) {}

  /** All lists the user can see (shared ones, too) with every task that is not deleted. */
  export(user: UserRow): CrystalExport {
    const rows = this.db
      .select({
        list: lists,
        role: listMembers.role,
        group: listGroups.name,
        position: listMembers.position,
        groupPosition: listGroups.position,
      })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .leftJoin(listGroups, eq(listGroups.id, listMembers.groupId))
      .where(and(eq(listMembers.userId, user.id), isNull(lists.deletedAt)))
      .orderBy(
        asc(sql`coalesce(${listGroups.position}, ${listMembers.position})`),
        asc(listMembers.position),
      )
      .all()
    const listIds = rows.map((row) => row.list.id)
    const taskRows =
      listIds.length > 0
        ? this.db
            .select()
            .from(tasks)
            .where(and(inArray(tasks.listId, listIds), isNull(tasks.deletedAt)))
            .orderBy(asc(tasks.position), asc(tasks.id))
            .all()
        : []
    const taskIds = taskRows.map((task) => task.id)
    const stepsByTask = new Map<string, ExportList['tasks'][number]['subtasks']>()
    const tagsByTask = new Map<string, string[]>()
    for (const chunk of chunks(taskIds, 500)) {
      for (const step of this.db
        .select()
        .from(subtasks)
        .where(inArray(subtasks.taskId, chunk))
        .orderBy(asc(subtasks.position), asc(subtasks.id))
        .all()) {
        stepsByTask.set(step.taskId, [
          ...(stepsByTask.get(step.taskId) ?? []),
          { title: step.title, completedAt: step.completedAt?.toISOString() ?? null },
        ])
      }
      for (const tag of this.db
        .select()
        .from(taskTags)
        .where(inArray(taskTags.taskId, chunk))
        .orderBy(asc(taskTags.tag))
        .all()) {
        tagsByTask.set(tag.taskId, [...(tagsByTask.get(tag.taskId) ?? []), tag.tag])
      }
    }

    return {
      format: 'crystal',
      version: 1,
      exportedAt: this.now().toISOString(),
      lists: rows.map(({ list, role, group }) => ({
        id: list.id,
        name: list.name,
        color: list.color,
        icon: list.icon,
        role,
        group,
        deadline: list.deadline,
        tasks: taskRows
          .filter((task) => task.listId === list.id)
          .map((task) => ({
            id: task.id,
            title: task.title,
            notes: task.notes,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            important: task.important,
            priority: task.priority as Priority,
            recurrence: task.recurrence ?? null,
            tags: tagsByTask.get(task.id) ?? [],
            remindAt: task.remindAt?.toISOString() ?? null,
            completedAt: task.completedAt?.toISOString() ?? null,
            createdAt: task.createdAt.toISOString(),
            subtasks: stepsByTask.get(task.id) ?? [],
          })),
      })),
    }
  }

  /** Creates new lists of the user's own from a file; nothing existing is changed. */
  import(user: UserRow, request: ImportRequest): ImportResult {
    const today = todayIn(user.timezone, this.now())
    const listName = request.listName ?? 'Import'
    let imported: ImportedList[]
    try {
      imported =
        request.format === 'crystal'
          ? parseCrystalExport(request.content)
          : request.format === 'todoist'
            ? parseTodoistCsv(request.content, { listName, today, locale: user.locale })
            : parseOutlookCsv(request.content, { listName, today, timeZone: user.timezone })
    } catch (error) {
      if (error instanceof ImportError) {
        throw new AppError(400, 'import_invalid', error.message)
      }
      throw error
    }

    const taskCount = imported.reduce((sum, list) => sum + list.tasks.length, 0)
    if (imported.length > MAX_IMPORT_LISTS || taskCount > MAX_IMPORT_TASKS) {
      throw new AppError(
        400,
        'import_invalid',
        `An import can have up to ${MAX_IMPORT_LISTS} lists and ${MAX_IMPORT_TASKS} tasks.`,
      )
    }

    const result = this.db.transaction((tx) => {
      const groups = new Map<string, string>()
      let count = 0
      for (const list of imported) {
        const groupName = list.group?.trim().slice(0, GROUP_NAME_MAX_LENGTH) || null
        let groupId: string | null = null
        if (groupName) {
          groupId = groups.get(groupName) ?? this.lists.addGroup(tx, user.id, groupName)
          groups.set(groupName, groupId)
        }
        const listId = this.lists.addOwnedList(tx, user.id, {
          name: list.name.trim().slice(0, LIST_NAME_MAX_LENGTH) || listName,
          color: list.color,
          icon: list.icon?.slice(0, LIST_ICON_MAX_LENGTH) || null,
          deadline: list.deadline ?? null,
          groupId,
        })
        const positions = list.tasks.length > 0 ? keysBetween(null, null, list.tasks.length) : []
        list.tasks.forEach((task, index) => {
          if (this.insertTask(tx, user, listId, positions[index]!, task, today)) count++
        })
      }
      return { lists: imported.length, tasks: count }
    })
    this.events.personalChange(user.id)
    return result
  }

  /** Stores one imported task; returns false if it has no usable title. */
  private insertTask(
    tx: Executor,
    user: UserRow,
    listId: string,
    position: string,
    task: ImportedTask,
    today: string,
  ): boolean {
    const title = task.title.trim().slice(0, TASK_TITLE_MAX_LENGTH)
    if (!title) return false
    const now = this.now()
    const recurrence = task.recurrence ? recurrenceSchema.safeParse(task.recurrence) : null
    const rule = recurrence?.success ? recurrence.data : null
    let dueDate = task.dueDate && DATE.test(task.dueDate) ? task.dueDate : null
    if (rule && !dueDate) dueDate = firstOccurrence(rule, today)
    const dueTime = dueDate && task.dueTime && TIME.test(task.dueTime) ? task.dueTime : null
    const completed = task.completedAt && !Number.isNaN(task.completedAt.getTime())
    const remindAt = task.remindAt && !Number.isNaN(task.remindAt.getTime()) ? task.remindAt : null
    const id = uuidv7(now.getTime())

    tx.insert(tasks)
      .values({
        id,
        listId,
        title,
        notes: task.notes.slice(0, TASK_NOTES_MAX_LENGTH),
        dueDate,
        dueTime,
        important: task.important,
        priority: task.priority >= 0 && task.priority <= 3 ? task.priority : 0,
        position,
        // Only the open task of a series repeats.
        recurrence: completed ? null : rule,
        remindAt,
        // Reminders from the past do not go off on import.
        remindedAt: remindAt && remindAt <= now ? now : null,
        reminderBy: remindAt ? user.id : null,
        completedAt: completed ? task.completedAt : null,
        completedBy: completed ? user.id : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const tags = [
      ...new Set(
        task.tags.flatMap((tag) => {
          const parsed = tagSchema.safeParse(tag)
          return parsed.success ? [parsed.data] : []
        }),
      ),
    ].slice(0, TAGS_PER_TASK_MAX)
    if (tags.length > 0)
      tx.insert(taskTags)
        .values(tags.map((tag) => ({ taskId: id, tag })))
        .run()

    const steps = task.subtasks.filter((step) => step.title.trim())
    const stepPositions = steps.length > 0 ? keysBetween(null, null, steps.length) : []
    steps.forEach((step, index) => {
      tx.insert(subtasks)
        .values({
          id: uuidv7(now.getTime()),
          taskId: id,
          title: step.title.trim().slice(0, SUBTASK_TITLE_MAX_LENGTH),
          position: stepPositions[index]!,
          completedAt: step.completed ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    })
    this.search.reindex(id, tx)
    return true
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}
