import { z } from 'zod'

import {
  ATTACHMENT_TYPES,
  PRIORITIES,
  RECURRENCE_BASES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MAX_INTERVAL,
  SEARCH_QUERY_MAX_LENGTH,
  SMART_VIEWS,
  SUBTASK_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TAGS_PER_TASK_MAX,
  TASK_NOTES_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

/**
 * A tag: letters, digits, `_`, `-` and `/`, stored in lower case without the
 * leading `#` (which is accepted and removed).
 */
export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .overwrite((value) => value.replace(/^#/, ''))
  .min(1)
  .max(TAG_MAX_LENGTH)
  .regex(/^[\p{L}\p{N}_\-/]+$/u, { error: 'validation.tag_format' })

/** Tags of a task: duplicates are removed, the rest is sorted. */
export const tagsSchema = z
  .array(tagSchema)
  .overwrite((tags) => [...new Set(tags)].sort())
  .max(TAGS_PER_TASK_MAX)

const weekdaysSchema = z.array(z.int().min(0).max(6)).max(7)

/**
 * How a task repeats. Weekly rules may name weekdays (0 = Monday … 6 =
 * Sunday); without them, the task repeats on the weekday of its due date.
 */
export const recurrenceSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  /** Every `interval` days, weeks, months or years. */
  interval: z.int().min(1).max(RECURRENCE_MAX_INTERVAL),
  weekdays: weekdaysSchema,
  from: z.enum(RECURRENCE_BASES),
})
export type Recurrence = z.infer<typeof recurrenceSchema>

/** Input form of a recurrence: everything but the frequency is optional. */
export const recurrenceInputSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z.int().min(1).max(RECURRENCE_MAX_INTERVAL).default(1),
    weekdays: weekdaysSchema.default([]),
    from: z.enum(RECURRENCE_BASES).default('due'),
  })
  .overwrite((rule) => ({
    ...rule,
    weekdays: rule.frequency === 'weekly' ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [],
  }))

/** A calendar day, `YYYY-MM-DD`, in the user's time zone. */
export const dueDateSchema = z.iso.date()
/** A time of day, `HH:MM` (24 h). */
export const dueTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.time_invalid' })

export const prioritySchema = z.union(PRIORITIES.map((value) => z.literal(value)))
export const taskTitleSchema = z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH)
export const taskNotesSchema = z.string().max(TASK_NOTES_MAX_LENGTH)
export const subtaskTitleSchema = z.string().trim().min(1).max(SUBTASK_TITLE_MAX_LENGTH)
export const smartViewSchema = z.enum(SMART_VIEWS)

export const subtaskSchema = z.object({
  id: idSchema,
  title: z.string(),
  completedAt: timestampSchema.nullable(),
  position: z.string(),
})
export type Subtask = z.infer<typeof subtaskSchema>

/** A file attached to a task (an image or a PDF). */
export const attachmentSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: z.enum(ATTACHMENT_TYPES),
  size: z.int(),
  createdAt: timestampSchema,
})
export type Attachment = z.infer<typeof attachmentSchema>

export const taskSchema = z.object({
  id: idSchema,
  listId: idSchema,
  title: z.string(),
  /** Markdown. */
  notes: z.string(),
  dueDate: dueDateSchema.nullable(),
  dueTime: dueTimeSchema.nullable(),
  important: z.boolean(),
  priority: prioritySchema,
  position: z.string(),
  completedAt: timestampSchema.nullable(),
  /** Whether the task is in the signed-in user's "My Day" for today. */
  inMyDay: z.boolean(),
  /** Completing a repeating task creates its next occurrence. */
  recurrence: recurrenceSchema.nullable(),
  tags: z.array(z.string()),
  /** Who is taking care of it; always a member of the list. */
  assignee: z.object({ id: idSchema, displayName: z.string() }).nullable(),
  /**
   * When to remind – an instant, independent of the due date. The assignee is
   * reminded, or whoever set the reminder if nobody is assigned.
   */
  remindAt: timestampSchema.nullable(),
  subtasks: z.array(subtaskSchema),
  /** Oldest first. */
  attachments: z.array(attachmentSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Task = z.infer<typeof taskSchema>

/**
 * Where to put a task: in `listId` (default: its current list), directly after
 * the task `after`, or at the top for `null`.
 */
export const taskPlacementSchema = z.object({
  listId: idSchema.optional(),
  after: idSchema.nullable(),
})
export type TaskPlacement = z.infer<typeof taskPlacementSchema>

export const createTaskSchema = z
  .object({
    /** Optional client-generated UUIDv7, so the client can refer to the task immediately. */
    id: idSchema.optional(),
    /** Defaults to the user's default list. */
    listId: idSchema.optional(),
    title: taskTitleSchema,
    notes: taskNotesSchema.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    dueTime: dueTimeSchema.nullable().optional(),
    important: z.boolean().optional(),
    priority: prioritySchema.optional(),
    myDay: z.boolean().optional(),
    /** Without a due date, the task becomes due on the first matching day from today. */
    recurrence: recurrenceInputSchema.nullable().optional(),
    tags: tagsSchema.optional(),
    /** A member of the list. */
    assigneeId: idSchema.nullable().optional(),
    remindAt: timestampSchema.nullable().optional(),
  })
  .refine((input) => !input.dueTime || input.dueDate, {
    error: 'validation.time_requires_date',
    path: ['dueTime'],
  })
/** What clients send. */
export type CreateTaskInput = z.input<typeof createTaskSchema>
/** What the server works with after validation (defaults applied). */
export type CreateTaskData = z.output<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    title: taskTitleSchema,
    notes: taskNotesSchema,
    dueDate: dueDateSchema.nullable(),
    dueTime: dueTimeSchema.nullable(),
    important: z.boolean(),
    priority: prioritySchema,
    completed: z.boolean(),
    /** Adds the task to (or removes it from) the signed-in user's My Day. */
    myDay: z.boolean(),
    placement: taskPlacementSchema,
    /** Replaces the rule; `null` stops repeating. */
    recurrence: recurrenceInputSchema.nullable(),
    /** Replaces all tags of the task. */
    tags: tagsSchema,
    /** A member of the list, or `null` for nobody. */
    assigneeId: idSchema.nullable(),
    /** Sets (or with `null` removes) the reminder. */
    remindAt: timestampSchema.nullable(),
  })
  .partial()
export type UpdateTaskInput = z.input<typeof updateTaskSchema>
export type UpdateTaskData = z.output<typeof updateTaskSchema>

export const createSubtaskSchema = z.object({
  id: idSchema.optional(),
  title: subtaskTitleSchema,
})
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>

export const updateSubtaskSchema = z
  .object({
    title: subtaskTitleSchema,
    completed: z.boolean(),
    placement: z.object({ after: idSchema.nullable() }),
  })
  .partial()
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>

export const viewCountsSchema = z.object({
  'my-day': z.int(),
  important: z.int(),
  planned: z.int(),
  overdue: z.int(),
  assigned: z.int(),
  all: z.int(),
  completed: z.int(),
})
export type ViewCounts = z.infer<typeof viewCountsSchema>

export const tagSummarySchema = z.object({
  name: z.string(),
  /** Open tasks with this tag in the lists the user can see. */
  openCount: z.int(),
})
export type TagSummary = z.infer<typeof tagSummarySchema>

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
})
