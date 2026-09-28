import { z } from 'zod'

import {
  PRIORITIES,
  SEARCH_QUERY_MAX_LENGTH,
  SMART_VIEWS,
  SUBTASK_TITLE_MAX_LENGTH,
  TASK_NOTES_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

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
  subtasks: z.array(subtaskSchema),
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
  })
  .refine((input) => !input.dueTime || input.dueDate, {
    error: 'validation.time_requires_date',
    path: ['dueTime'],
  })
export type CreateTaskInput = z.infer<typeof createTaskSchema>

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
  })
  .partial()
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

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
  all: z.int(),
  completed: z.int(),
})
export type ViewCounts = z.infer<typeof viewCountsSchema>

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
})
