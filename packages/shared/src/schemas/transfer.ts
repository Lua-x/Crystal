import { z } from 'zod'

import {
  GROUP_NAME_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  LIST_ROLES,
  PRIORITIES,
} from '../constants.js'
import { timestampSchema } from './common.js'
import { recurrenceSchema } from './tasks.js'

/** Where an import comes from. */
export const IMPORT_FORMATS = ['crystal', 'todoist', 'outlook'] as const
export type ImportFormat = (typeof IMPORT_FORMATS)[number]

/** Imports are sent as text; this keeps a single request reasonably small. */
export const IMPORT_MAX_CHARS = 10_000_000

export const importRequestSchema = z.object({
  format: z.enum(IMPORT_FORMATS),
  /** The file's content: Crystal JSON, or CSV from Todoist or Outlook. */
  content: z.string().min(1).max(IMPORT_MAX_CHARS),
  /** Name of the new list for CSV imports (one file is one list). */
  listName: z.string().trim().min(1).max(LIST_NAME_MAX_LENGTH).optional(),
})
export type ImportRequest = z.infer<typeof importRequestSchema>

export const importResultSchema = z.object({
  lists: z.int(),
  tasks: z.int(),
})
export type ImportResult = z.infer<typeof importResultSchema>

/* ── Crystal's own export format (version 1) ─────────────────────────── */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/)

export const exportSubtaskSchema = z.object({
  title: z.string(),
  completedAt: timestampSchema.nullable(),
})

export const exportTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().default(''),
  dueDate: dateSchema.nullable().default(null),
  dueTime: timeSchema.nullable().default(null),
  important: z.boolean().default(false),
  priority: z.union(PRIORITIES.map((value) => z.literal(value))).default(0),
  recurrence: recurrenceSchema.nullable().default(null),
  tags: z.array(z.string()).default([]),
  remindAt: timestampSchema.nullable().default(null),
  completedAt: timestampSchema.nullable().default(null),
  createdAt: timestampSchema.optional(),
  subtasks: z.array(exportSubtaskSchema).default([]),
})
export type ExportTask = z.infer<typeof exportTaskSchema>

export const exportListSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(LIST_NAME_MAX_LENGTH),
  /** One of the list colors; imports fall back to blue for anything else. */
  color: z.string().default('blue'),
  icon: z.string().nullable().default(null),
  /** The exporting person's access; imports always create lists of one's own. */
  role: z.enum(LIST_ROLES).optional(),
  /** Name of the sidebar group the list was in. */
  group: z.string().min(1).max(GROUP_NAME_MAX_LENGTH).nullable().default(null),
  tasks: z.array(exportTaskSchema),
})
export type ExportList = z.infer<typeof exportListSchema>

export const crystalExportSchema = z.object({
  format: z.literal('crystal'),
  version: z.literal(1),
  exportedAt: timestampSchema,
  lists: z.array(exportListSchema),
})
export type CrystalExport = z.infer<typeof crystalExportSchema>
